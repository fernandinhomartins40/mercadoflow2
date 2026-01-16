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
        self.app = ServiceApp()

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.stop_event)
        self.running = False
        self.app.stop()

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_, ''))
        self.main()

    def main(self):
        self.app.start()


if __name__ == '__main__':
    win32serviceutil.HandleCommandLine(PDV2CloudService)
