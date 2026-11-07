"""Janela do app: chave da loja, câmeras, calibração e situação."""
from __future__ import annotations

import os
import sys
import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, simpledialog, ttk

import cv2
from PIL import Image, ImageTk

from . import store
from .detector import PersonDetector
from .mapping import Accumulator, FloorMap
from .pipeline import CameraWorker, foot_points, grab_frame

FOREST, LIME, GROUND, INK, MUTED = "#0F3A29", "#D7F26B", "#EEF3EF", "#0B1F16", "#5F7067"
UPLOAD_EVERY_MS = 5 * 60 * 1000
NOTICE = (
    "O MercadoFlow Câmeras analisa o vídeo neste computador para saber onde as pessoas passam e param na loja.\n\n"
    "• Nenhuma imagem ou vídeo sai deste computador, e nada é gravado.\n"
    "• Não há reconhecimento facial nem identificação de pessoas.\n"
    "• Só são enviados números: tempo de presença em cada ponto do piso, por hora.\n\n"
    "Mantenha o aviso de monitoramento por câmeras visível para os clientes e a equipe, como a LGPD pede."
)
COLORS = ["#dc2626", "#2563eb", "#16a34a", "#d97706"]


def resource(*parts: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base, *parts)


class Calibrate(tk.Toplevel):
    """Marca os mesmos 4 pontos do piso na imagem e na planta."""

    def __init__(self, master, cam: dict, frame, plan: dict, on_save):
        super().__init__(master)
        self.title(f"Calibrar: {cam['name']}")
        self.configure(bg=GROUND)
        self.cam, self.plan, self.on_save = cam, plan, on_save
        self.image_pts, self.plan_pts = [], []
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        self.img_scale = min(620 / w, 460 / h)
        self.photo = ImageTk.PhotoImage(Image.fromarray(rgb).resize((int(w * self.img_scale), int(h * self.img_scale))))
        self.plan_scale = min(420 / plan["width"], 460 / plan["height"])

        ttk.Label(self, text="Escolha 4 pontos do piso fáceis de achar nos dois lados (cantos de gôndola, por exemplo). "
                             "Clique neles na mesma ordem na imagem e na planta.", wraplength=1040).grid(row=0, column=0, columnspan=2, padx=12, pady=(12, 6), sticky="w")
        self.left = tk.Canvas(self, width=self.photo.width(), height=self.photo.height(), highlightthickness=0)
        self.left.grid(row=1, column=0, padx=(12, 6))
        self.left.create_image(0, 0, image=self.photo, anchor="nw")
        self.left.bind("<Button-1>", self._click_image)
        self.right = tk.Canvas(self, width=int(plan["width"] * self.plan_scale), height=int(plan["height"] * self.plan_scale), bg="#f6f8f5", highlightthickness=1)
        self.right.grid(row=1, column=1, padx=(6, 12))
        self.right.bind("<Button-1>", self._click_plan)
        self._draw_plan()
        self.hint = ttk.Label(self, text="")
        self.hint.grid(row=2, column=0, columnspan=2, padx=12, pady=6, sticky="w")
        bar = ttk.Frame(self)
        bar.grid(row=3, column=0, columnspan=2, padx=12, pady=(0, 12), sticky="e")
        ttk.Button(bar, text="Recomeçar", command=self._reset).pack(side="left", padx=4)
        ttk.Button(bar, text="Salvar", command=self._save).pack(side="left", padx=4)
        self._update_hint()

    def _draw_plan(self):
        s = self.plan_scale
        for f in self.plan.get("fixtures", []):
            self.right.create_rectangle(f["x"] * s, f["y"] * s, (f["x"] + f["w"]) * s, (f["y"] + f["h"]) * s, fill="#e2e8f0", outline="#94a3b8")
            if f.get("label"):
                self.right.create_text((f["x"] + f["w"] / 2) * s, (f["y"] + f["h"] / 2) * s, text=f["label"], font=("Segoe UI", 7))

    def _mark(self, canvas, x, y, n):
        canvas.create_oval(x - 7, y - 7, x + 7, y + 7, fill=COLORS[n], outline="white", width=2, tags="pt")
        canvas.create_text(x, y, text=str(n + 1), fill="white", font=("Segoe UI", 8, "bold"), tags="pt")

    def _click_image(self, e):
        if len(self.image_pts) < 4:
            self._mark(self.left, e.x, e.y, len(self.image_pts))
            self.image_pts.append([e.x / self.img_scale, e.y / self.img_scale])
            self._update_hint()

    def _click_plan(self, e):
        if len(self.plan_pts) < 4:
            self._mark(self.right, e.x, e.y, len(self.plan_pts))
            self.plan_pts.append([e.x / self.plan_scale, e.y / self.plan_scale])
            self._update_hint()

    def _update_hint(self):
        self.hint.configure(text=f"Imagem: {len(self.image_pts)} de 4 pontos · Planta: {len(self.plan_pts)} de 4 pontos")

    def _reset(self):
        self.image_pts, self.plan_pts = [], []
        self.left.delete("pt")
        self.right.delete("pt")
        self._update_hint()

    def _save(self):
        try:
            FloorMap(self.image_pts, self.plan_pts)
        except ValueError as e:
            messagebox.showerror("Calibração", str(e), parent=self)
            return
        self.on_save(self.image_pts, self.plan_pts)
        self.destroy()


class App(tk.Tk):
    def __init__(self, minimized: bool = False):
        super().__init__()
        self.title("MercadoFlow Câmeras")
        self.geometry("760x520")
        self.configure(bg=GROUND)
        self.cfg = store.Config()
        self.plan = None
        self.detector = None
        self.workers: dict[str, CameraWorker] = {}
        self.accs: dict[str, Accumulator] = {}
        self.last_upload = "ainda não enviado"
        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        if not self.cfg.data["accepted_notice"]:
            self.after(100, self._notice)
        else:
            self.after(100, self._connect)
        self.after(UPLOAD_EVERY_MS, self._upload_loop)
        self.after(1000, self._refresh)
        if minimized:
            self.iconify()

    def _build(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure(".", background=GROUND, foreground=INK, font=("Segoe UI", 10))
        style.configure("TButton", padding=8)
        style.configure("Treeview", rowheight=28, background="white", fieldbackground="white")
        head = tk.Frame(self, bg=FOREST, height=56)
        head.pack(fill="x")
        try:
            self.logo = ImageTk.PhotoImage(Image.open(resource("assets", "logo-branco.png")).resize((184, 35)))
            tk.Label(head, image=self.logo, bg=FOREST).pack(side="left", padx=16, pady=10)
        except OSError:
            tk.Label(head, text="MercadoFlow Câmeras", bg=FOREST, fg="white", font=("Segoe UI", 14, "bold")).pack(side="left", padx=16, pady=12)
        tk.Frame(self, bg=LIME, height=4).pack(fill="x")

        keyrow = ttk.Frame(self)
        keyrow.pack(fill="x", padx=16, pady=(12, 6))
        ttk.Label(keyrow, text="Chave da loja").pack(side="left")
        self.key_var = tk.StringVar(value=self.cfg.key)
        ttk.Entry(keyrow, textvariable=self.key_var, show="•").pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(keyrow, text="Conectar", command=self._connect).pack(side="left")
        self.conn = ttk.Label(self, text="Gere a chave em Vender → Planta e prateleiras → Movimento.", foreground=MUTED)
        self.conn.pack(fill="x", padx=16)

        self.tree = ttk.Treeview(self, columns=("nome", "estado", "pessoas", "hoje"), show="headings", height=8)
        for col, label, width in (("nome", "Câmera", 200), ("estado", "Situação", 280), ("pessoas", "Pessoas agora", 90), ("hoje", "Presença hoje", 110)):
            self.tree.heading(col, text=label)
            self.tree.column(col, width=width, anchor="w")
        self.tree.pack(fill="both", expand=True, padx=16, pady=10)

        bar = ttk.Frame(self)
        bar.pack(fill="x", padx=16)
        ttk.Button(bar, text="Adicionar câmera", command=self._add).pack(side="left")
        ttk.Button(bar, text="Testar", command=self._test).pack(side="left", padx=6)
        ttk.Button(bar, text="Calibrar", command=self._calibrate).pack(side="left")
        ttk.Button(bar, text="Remover", command=self._remove).pack(side="left", padx=6)
        self.foot = ttk.Label(self, text="", foreground=MUTED)
        self.foot.pack(fill="x", padx=16, pady=10)

    def _notice(self):
        if messagebox.askokcancel("Antes de começar", NOTICE, parent=self):
            self.cfg.data["accepted_notice"] = True
            self.cfg.save()
            self._connect()
        else:
            self.destroy()

    def _connect(self):
        key = self.key_var.get().strip()
        if not key:
            return
        self.conn.configure(text="Conectando…", foreground=MUTED)

        def work():
            try:
                plan = store.fetch_plan(key)
            except store.ApiError as e:
                self.after(0, lambda msg=str(e): self.conn.configure(text=msg, foreground="#b91c1c"))
                return
            self.after(0, lambda: self._connected(key, plan))

        threading.Thread(target=work, daemon=True).start()

    def _connected(self, key, plan):
        self.cfg.key = key
        self.cfg.save()
        if not plan:
            self.conn.configure(text="Conectado, mas a loja ainda não tem planta. Monte em Vender → Planta e prateleiras.", foreground="#b45309")
            return
        self.plan = plan
        self.conn.configure(text=f"Conectado. Planta de {plan['width']:g} × {plan['height']:g} m.", foreground="#157A3D")
        self._start_all()

    def _start_all(self):
        for cam in self.cfg.cameras:
            self._start(cam)

    def _start(self, cam):
        if cam["id"] in self.workers or not self.plan or len(cam.get("image_points", [])) != 4:
            return
        try:
            if self.detector is None:
                self.detector = PersonDetector(resource("assets", "yolox_tiny.onnx"))
            floor = FloorMap(cam["image_points"], cam["plan_points"])
        except Exception as e:  # modelo ausente ou calibração corrompida não derrubam o app
            self.conn.configure(text=f"Não foi possível iniciar {cam['name']}: {e}", foreground="#b91c1c")
            return
        acc = self.accs.setdefault(cam["id"], Accumulator(self.cfg.state_path(cam["id"])))
        worker = CameraWorker(cam, self.detector, floor, acc, self.plan["width"], self.plan["height"])
        self.workers[cam["id"]] = worker
        worker.start()

    def _selected(self):
        sel = self.tree.selection()
        cam = next((c for c in self.cfg.cameras if sel and c["id"] == sel[0]), None)
        if not cam:
            messagebox.showinfo("Câmeras", "Selecione uma câmera na lista.", parent=self)
        return cam

    def _add(self):
        name = simpledialog.askstring("Nova câmera", "Nome (ex.: Corredor 3):", parent=self)
        if not name:
            return
        source = simpledialog.askstring(
            "Nova câmera",
            "Endereço RTSP da câmera ou do DVR, ou o número de uma câmera USB (0, 1...).\n"
            "Exemplo: rtsp://usuario:senha@192.168.0.50:554/stream1", parent=self)
        if source:
            self.cfg.add_camera(name, source)
            self.cfg.save()

    def _test(self):
        cam = self._selected()
        if not cam:
            return
        self._with_frame(cam, self._show_test)

    def _with_frame(self, cam, then):
        self.foot.configure(text=f"Abrindo {cam['name']}…")

        def work():
            frame = grab_frame(cam["source"])
            self.after(0, lambda: self._got_frame(cam, frame, then))

        threading.Thread(target=work, daemon=True).start()

    def _got_frame(self, cam, frame, then):
        self.foot.configure(text="")
        if frame is None:
            messagebox.showerror("Câmera", f"Não veio imagem de {cam['name']}. Confira o endereço, a senha e a rede.", parent=self)
            return
        then(cam, frame)

    def _show_test(self, cam, frame):
        """Mostra o que o app enxerga, só na tela: quadro com as pessoas achadas."""
        if self.detector is None:
            self.detector = PersonDetector(resource("assets", "yolox_tiny.onnx"))
        boxes, _ = self.detector.detect(frame)
        for (x1, y1, x2, y2), (fx, fy) in zip(boxes, foot_points(boxes)):
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (61, 122, 21), 2)
            cv2.circle(frame, (int(fx), int(fy)), 5, (41, 58, 15), -1)
        win = tk.Toplevel(self)
        win.title(f"{cam['name']}: {len(boxes)} pessoa(s) na imagem")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        s = min(900 / w, 600 / h)
        win.photo = ImageTk.PhotoImage(Image.fromarray(rgb).resize((int(w * s), int(h * s))))
        tk.Label(win, image=win.photo).pack()

    def _calibrate(self):
        cam = self._selected()
        if not cam:
            return
        if not self.plan:
            messagebox.showinfo("Calibrar", "Conecte com a chave da loja primeiro. A loja precisa ter a planta montada.", parent=self)
            return
        self._with_frame(cam, lambda c, frame: Calibrate(self, c, frame, self.plan, lambda i, p: self._saved_calibration(c, i, p)))

    def _saved_calibration(self, cam, image_pts, plan_pts):
        cam["image_points"], cam["plan_points"] = image_pts, plan_pts
        self.cfg.save()
        worker = self.workers.pop(cam["id"], None)
        if worker:
            worker.stop()
        self._start(cam)

    def _remove(self):
        cam = self._selected()
        if cam and messagebox.askyesno("Remover", f"Remover {cam['name']}? O que já foi enviado continua no MercadoFlow.", parent=self):
            worker = self.workers.pop(cam["id"], None)
            if worker:
                worker.stop()
            self.cfg.cameras.remove(cam)
            self.cfg.save()

    def _refresh(self):
        now = datetime.now()
        wanted = {c["id"] for c in self.cfg.cameras}
        for iid in self.tree.get_children():
            if iid not in wanted:
                self.tree.delete(iid)
        for cam in self.cfg.cameras:
            worker = self.workers.get(cam["id"])
            state = worker.status if worker else ("Falta calibrar" if len(cam.get("image_points", [])) != 4 else "Parada")
            acc = self.accs.get(cam["id"])
            minutes = (acc.today_seconds(now) / 60) if acc else 0
            values = (cam["name"], state, worker.people if worker else "-", f"{minutes:,.0f} min".replace(",", "."))
            if self.tree.exists(cam["id"]):
                self.tree.item(cam["id"], values=values)
            else:
                self.tree.insert("", "end", iid=cam["id"], values=values)
        self.foot.configure(text=f"Só números saem deste computador. Último envio: {self.last_upload}.")
        self.after(1000, self._refresh)

    def _upload_loop(self):
        threading.Thread(target=self._upload_once, daemon=True).start()
        self.after(UPLOAD_EVERY_MS, self._upload_loop)

    def _upload_once(self):
        key = self.cfg.key
        if not key:
            return
        for cam_id, acc in list(self.accs.items()):
            try:
                acc.save()
                buckets = acc.pending()
                if buckets:
                    store.upload(key, cam_id, buckets)
                    acc.acknowledge(buckets, datetime.now())
                    acc.save()
                self.last_upload = datetime.now().strftime("%d/%m às %H:%M")
            except store.ApiError as e:
                self.last_upload = str(e)
            except OSError as e:
                self.last_upload = f"não foi possível gravar os números ({e})"

    def _on_close(self):
        if messagebox.askyesno("Fechar", "Fechando o app, a análise das câmeras para. Quer parar mesmo?\n\nEscolha Não para só minimizar.", parent=self):
            for worker in self.workers.values():
                worker.stop()
            self._upload_once()
            self.destroy()
        else:
            self.iconify()
