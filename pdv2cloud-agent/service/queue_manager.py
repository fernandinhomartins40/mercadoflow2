from datetime import datetime
from pathlib import Path
from sqlalchemy import Column, String, Integer, DateTime, Text, Enum, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import enum

DB_PATH = Path("C:/ProgramData/PDV2Cloud/queue.db")
Base = declarative_base()


class ProcessStatus(enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SENT = "SENT"
    ERROR = "ERROR"
    DEAD_LETTER = "DEAD_LETTER"


class QueuedInvoice(Base):
    __tablename__ = "queued_invoices"

    id = Column(Integer, primary_key=True)
    chave_nfe = Column(String(44), unique=True, nullable=False)
    payload_json = Column(Text, nullable=False)
    status = Column(Enum(ProcessStatus), default=ProcessStatus.PENDING)
    tentativas = Column(Integer, default=0)
    data_criacao = Column(DateTime, nullable=False)
    data_processamento = Column(DateTime)
    erro_detalhes = Column(Text)
    xml_hash = Column(String(64))


class QueueManager:
    def __init__(self):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{DB_PATH}")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def enqueue(self, chave_nfe: str, payload_json: str, xml_hash: str) -> None:
        session = self.Session()
        try:
            exists = session.query(QueuedInvoice).filter_by(chave_nfe=chave_nfe).first()
            if exists:
                return
            if xml_hash:
                hash_exists = session.query(QueuedInvoice).filter_by(xml_hash=xml_hash).first()
                if hash_exists:
                    return
            item = QueuedInvoice(
                chave_nfe=chave_nfe,
                payload_json=payload_json,
                status=ProcessStatus.PENDING,
                tentativas=0,
                data_criacao=datetime.utcnow(),
                xml_hash=xml_hash,
            )
            session.add(item)
            session.commit()
        finally:
            session.close()

    def next_pending(self, limit: int = 50):
        session = self.Session()
        try:
            return (
                session.query(QueuedInvoice)
                .filter_by(status=ProcessStatus.PENDING)
                .limit(limit)
                .all()
            )
        finally:
            session.close()

    def mark_processing(self, item_id: int):
        session = self.Session()
        try:
            item = session.get(QueuedInvoice, item_id)
            if item:
                item.status = ProcessStatus.PROCESSING
                item.data_processamento = datetime.utcnow()
                session.commit()
        finally:
            session.close()

    def mark_sent(self, item_id: int):
        session = self.Session()
        try:
            item = session.get(QueuedInvoice, item_id)
            if item:
                item.status = ProcessStatus.SENT
                item.data_processamento = datetime.utcnow()
                session.commit()
        finally:
            session.close()

    def mark_error(self, item_id: int, error: str, dead_letter: bool = False):
        session = self.Session()
        try:
            item = session.get(QueuedInvoice, item_id)
            if item:
                item.tentativas += 1
                item.erro_detalhes = error
                item.status = ProcessStatus.DEAD_LETTER if dead_letter else ProcessStatus.ERROR
                session.commit()
        finally:
            session.close()

    def reset_errors(self):
        session = self.Session()
        try:
            items = session.query(QueuedInvoice).filter_by(status=ProcessStatus.ERROR).all()
            for item in items:
                item.status = ProcessStatus.PENDING
            session.commit()
        finally:
            session.close()

    def stats(self) -> dict:
        session = self.Session()
        try:
            total = session.query(QueuedInvoice).count()
            pending = session.query(QueuedInvoice).filter_by(status=ProcessStatus.PENDING).count()
            error = session.query(QueuedInvoice).filter_by(status=ProcessStatus.ERROR).count()
            dead = session.query(QueuedInvoice).filter_by(status=ProcessStatus.DEAD_LETTER).count()
            return {
                "total": total,
                "pending": pending,
                "error": error,
                "dead_letter": dead,
            }
        finally:
            session.close()
