import win32serviceutil
import win32service
import win32event
import servicemanager
from .main import ServiceApp


class PDV2CloudService(win32serviceutil.ServiceFramework):
    _svc_name_ = "PDV2CloudAgent"
    _svc_display_name_ = "PDV2Cloud Collector Agent"
    _svc_description_ = "Coleta e transmite dados de vendas para PDV2Cloud"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        self.running = True
        self.app = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.stop_event)
        self.running = False
        if self.app:
            self.app.stop()

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.main()

    def main(self):
        try:
            self.app = ServiceApp()
            self.app.start()
            # Keep service running until stop event
            import time
            while self.running and win32event.WaitForSingleObject(self.stop_event, 1000) != win32event.WAIT_OBJECT_0:
                time.sleep(1)
        except Exception as e:
            servicemanager.LogErrorMsg(f"Service failed: {e}")
            # Re-raise to ensure service stops properly on fatal errors
            raise


if __name__ == '__main__':
    win32serviceutil.HandleCommandLine(PDV2CloudService)
