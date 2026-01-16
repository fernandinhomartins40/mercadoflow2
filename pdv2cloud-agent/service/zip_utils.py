import zipfile
from pathlib import Path
from typing import List


def process_zip(zip_path: Path) -> List[Path]:
    extract_dir = zip_path.parent / "temp_extract"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_dir)

    xml_files = list(extract_dir.glob("*.xml"))
    return xml_files
