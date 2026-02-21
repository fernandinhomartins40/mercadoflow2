"""
Check Windows Event Viewer for PDV2Cloud service errors.
This helps diagnose why the service fails to start.
"""
import subprocess
import sys

def get_service_errors():
    """Get recent service errors from Windows Event Log"""
    print("=" * 60)
    print("Checking Windows Event Viewer for service errors...")
    print("=" * 60)
    print()

    # Query Application log for errors related to PDV2Cloud
    cmd = [
        'powershell',
        '-Command',
        '''
        Get-EventLog -LogName Application -Newest 50 -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -like "*PDV2Cloud*" -or $_.Message -like "*PDV2Cloud*" } |
        Format-List TimeGenerated, EntryType, Source, Message
        '''
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.stdout.strip():
            print("Application Log Errors:")
            print(result.stdout)
        else:
            print("No PDV2Cloud errors found in Application log")
    except Exception as e:
        print(f"Failed to query Application log: {e}")

    print()

    # Query System log for service control errors
    cmd2 = [
        'powershell',
        '-Command',
        '''
        Get-EventLog -LogName System -Newest 50 -ErrorAction SilentlyContinue |
        Where-Object { $_.Source -eq "Service Control Manager" -and $_.Message -like "*PDV2Cloud*" } |
        Format-List TimeGenerated, EntryType, EventID, Message
        '''
    ]

    try:
        result = subprocess.run(cmd2, capture_output=True, text=True, timeout=30)
        if result.stdout.strip():
            print("System Log Service Control Manager Errors:")
            print(result.stdout)
        else:
            print("No PDV2Cloud service errors found in System log")
    except Exception as e:
        print(f"Failed to query System log: {e}")

    print()
    print("=" * 60)

if __name__ == "__main__":
    get_service_errors()
