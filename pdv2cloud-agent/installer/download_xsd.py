import io
import shutil
import zipfile
from pathlib import Path
from urllib.request import urlopen


ZIP_URL = "https://github.com/nfephp-org/sped-nfe/archive/refs/heads/master.zip"
TARGET_DIR = Path("C:/ProgramData/PDV2Cloud/xsd")


def ensure_xsd() -> None:
    schemes_dir = TARGET_DIR / "schemes"
    if schemes_dir.exists():
        return

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    with urlopen(ZIP_URL) as response:
        data = response.read()

    with zipfile.ZipFile(io.BytesIO(data)) as zip_ref:
        zip_ref.extractall(TARGET_DIR)

    extracted = TARGET_DIR / "sped-nfe-master" / "schemes"
    if extracted.exists():
        shutil.move(str(extracted), str(schemes_dir))
    if (TARGET_DIR / "sped-nfe-master").exists():
        shutil.rmtree(TARGET_DIR / "sped-nfe-master", ignore_errors=True)


if __name__ == "__main__":
    ensure_xsd()
