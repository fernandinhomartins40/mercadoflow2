import zipfile
from pathlib import Path
from typing import List
import time


def extract_zip(zip_path: Path) -> tuple[Path, List[Path]]:
    extract_dir = zip_path.parent / f"temp_extract_{zip_path.stem}_{int(time.time())}"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    xml_files = list(extract_dir.glob("*.xml"))
    return extract_dir, xml_files
