"""
Test script to diagnose service startup issues.
Run this manually to see what errors occur during service initialization.
"""
import sys
import os
import logging
from pathlib import Path

# Add service directory to path
service_dir = Path(__file__).parent
sys.path.insert(0, str(service_dir))

# Setup logging to console
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("PDV2Cloud.TestStartup")

def test_imports():
    """Test if all required modules can be imported"""
    logger.info("Testing imports...")
    try:
        from main import ServiceApp
        logger.info("✓ main.ServiceApp imported successfully")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to import: {e}", exc_info=True)
        return False

def test_service_creation():
    """Test if ServiceApp can be instantiated"""
    logger.info("Testing ServiceApp instantiation...")
    try:
        from main import ServiceApp
        app = ServiceApp()
        logger.info("✓ ServiceApp created successfully")
        return app
    except Exception as e:
        logger.error(f"✗ Failed to create ServiceApp: {e}", exc_info=True)
        return None

def test_service_start(app):
    """Test if ServiceApp.start() completes without blocking"""
    logger.info("Testing ServiceApp.start()...")
    try:
        app.start()
        logger.info("✓ ServiceApp.start() completed successfully")
        logger.info("Service is now running in background thread")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to start ServiceApp: {e}", exc_info=True)
        return False

def main():
    logger.info("=" * 60)
    logger.info("PDV2Cloud Service Startup Diagnostic Test")
    logger.info("=" * 60)

    # Test 1: Imports
    if not test_imports():
        logger.error("FAILED: Cannot import required modules")
        return 1

    # Test 2: Service creation
    app = test_service_creation()
    if not app:
        logger.error("FAILED: Cannot create ServiceApp instance")
        return 1

    # Test 3: Service start
    if not test_service_start(app):
        logger.error("FAILED: Cannot start service")
        return 1

    logger.info("=" * 60)
    logger.info("SUCCESS: All tests passed!")
    logger.info("Service started successfully and is running in background")
    logger.info("=" * 60)

    # Keep running for a few seconds to observe behavior
    import time
    logger.info("Keeping service alive for 10 seconds to observe behavior...")
    time.sleep(10)

    logger.info("Stopping service...")
    app.stop()

    logger.info("Test completed successfully!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
