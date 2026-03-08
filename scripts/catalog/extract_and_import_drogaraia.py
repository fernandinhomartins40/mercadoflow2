#!/usr/bin/env python3
from __future__ import annotations

import sys


def main() -> int:
    sys.stderr.write(
        "Drogaria Raia bloqueia acesso automatizado deste ambiente com HTTP 403 em home, sitemap e paginas de produto. "
        "O job permanece documentado, mas desabilitado ate existir uma fonte publica viavel ou whitelist.\n"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
