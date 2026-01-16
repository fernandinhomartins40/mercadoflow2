import sqlite3
from typing import Iterable

try:
    import pyodbc
except Exception:
    pyodbc = None


class DatabaseConnector:
    def read_xml_blobs_sqlite(self, db_path: str, query: str) -> Iterable[bytes]:
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.execute(query)
            for row in cursor:
                yield row[0]
        finally:
            conn.close()

    def read_xml_blobs_firebird(self, connection_string: str, query: str) -> Iterable[bytes]:
        if pyodbc is None:
            raise RuntimeError("pyodbc not installed")
        conn = pyodbc.connect(connection_string)
        try:
            cursor = conn.cursor()
            cursor.execute(query)
            for row in cursor:
                yield row[0]
        finally:
            conn.close()
