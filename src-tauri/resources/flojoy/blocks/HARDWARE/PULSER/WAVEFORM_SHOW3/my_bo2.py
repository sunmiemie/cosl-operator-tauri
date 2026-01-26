import numpy as np
import pyqtgraph as pg
from pyqtgraph.Qt import QtCore, QtWidgets
import sys
import serial
from enum import IntEnum
import struct
import argparse


class COMMState(IntEnum):
    Waiting = 0
    Syncing = 1
    Ready = 2


class SignalMode(IntEnum):
    Target = 0
    Actual = 1


class SerialWorker(QtCore.QObject):
    data_ready_actual = QtCore.pyqtSignal(np.ndarray)
    data_ready_target = QtCore.pyqtSignal(np.ndarray)
    finished = QtCore.pyqtSignal()

    def __init__(self, port):
        super().__init__()
        self.port = port
        self._running = False
        self.ser = None
        self.actual_buffer = []
        self.target_buffer = []
        self.wave_scale = 1

    def open(self):
        self.ser = serial.Serial(
            # port='/dev/ttyUSB1',
            port=self.port,
            baudrate=115200,
            bytesize=serial.EIGHTBITS,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            timeout=0.1,
            write_timeout=1
        )
        try:
            return True
        except serial.SerialException as e:
            print(f"串口打开失败: {e}")
            return False

    def start_reading(self):
        self._running = True
        self.run()

    def stop_reading(self):
        self._running = False
        if self.ser and self.ser.is_open:
            self.ser.close()

    def run(self):
        if not self.open():
            self.finished.emit()
            return

        state = COMMState.Waiting
        while self._running:
            if state == COMMState.Waiting:
                buff = self.ser.read(1)
                if buff == b'\xAA':
                    state = COMMState.Syncing

            elif state == COMMState.Syncing:
                buff = self.ser.read(1)
                if buff == b'\xFF':
                    state = COMMState.Ready
                elif buff == b'\xAA':
                    state = COMMState.Syncing
                else:
                    state = COMMState.Waiting

            elif state == COMMState.Ready:
                state = COMMState.Waiting
                buff = self.ser.read(12)
                if len(buff) != 12:
                    continue
                self.parse_data(buff, SignalMode.Actual)

            QtCore.QCoreApplication.processEvents()

        self.ser.close()
        self.finished.emit()

    def parse_data(self, buff: bytes, mode: SignalMode):
        actual_data = struct.unpack('>H', buff[8:10])[0]
        self.actual_buffer.append(actual_data)
        target_data = struct.unpack('>H', buff[6:8])[0]
        self.target_buffer.append(target_data)

        if len(self.actual_buffer) == 250:
            wvf_actual = np.array(self.actual_buffer, dtype=np.float32)
            wvf_actual = wvf_actual * self.wave_scale * 16 / 65535 + 4
            self.data_ready_actual.emit(wvf_actual)
            self.actual_buffer.clear()

            wvf_target = np.array(self.target_buffer, dtype=np.float32)
            wvf_target = wvf_target * self.wave_scale * 16 / 65535 + 4
            self.data_ready_target.emit(wvf_target)
            self.target_buffer.clear()


class RealTimePlot:
    def __init__(self, worker):
        self.app = QtWidgets.QApplication(sys.argv)
        self.win = pg.GraphicsLayoutWidget(show=True, title="实时波形")
        self.win.resize(1000, 600)
        self.win.closeEvent = self.close_event
        self.worker = worker
        # 绘图设置
        self.plot = self.win.addPlot(title="波形数据")
        self.plot.setLabel('left', '幅度')
        self.plot.setLabel('bottom', '时间')
        self.plot.showGrid(x=True, y=True)
        self.plot.addLegend()

        # 创建两条曲线
        self.actual_curve = self.plot.plot(pen='r', name='实际波形')
        self.target_curve = self.plot.plot(pen='b', name='目标波形')

        # 数据缓冲区
        self.buffer_size = 200
        self.actual_data = np.zeros(self.buffer_size)
        self.target_data = np.zeros(self.buffer_size)

        # 定时器
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update_plot)
        self.timer.start(50)

    def handle_actual_data(self, new_data):
        if len(new_data) > self.buffer_size:
            new_data = new_data[-self.buffer_size:]
        self.actual_data = np.roll(self.actual_data, -len(new_data))
        self.actual_data[-len(new_data):] = new_data

    def handle_target_data(self, new_data):
        if len(new_data) > self.buffer_size:
            new_data = new_data[-self.buffer_size:]
        self.target_data = np.roll(self.target_data, -len(new_data))
        self.target_data[-len(new_data):] = new_data

    def update_plot(self):
        self.actual_curve.setData(self.actual_data)
        self.target_curve.setData(self.target_data)
        self.plot.setXRange(0, self.buffer_size)

    def close_event(self, event):
        self.worker.stop_reading()
        event.accept()

    def run(self):
        sys.exit(self.app.exec())


if __name__ == '__main__':
    # 解析命令行参数
    parser = argparse.ArgumentParser(description='实时波形监控')
    parser.add_argument('port', type=str, help='串口端口，例如COM4或/dev/ttyUSB0')
    args = parser.parse_args()

    worker = SerialWorker(port=args.port)
    plot = RealTimePlot(worker)

    # 线程设置
    thread = QtCore.QThread()
    worker.moveToThread(thread)

    # 信号连接
    worker.data_ready_actual.connect(plot.handle_actual_data)
    worker.data_ready_target.connect(plot.handle_target_data)
    thread.started.connect(worker.start_reading)
    worker.finished.connect(thread.quit)
    worker.finished.connect(worker.deleteLater)
    thread.finished.connect(thread.deleteLater)

    # 启动线程和GUI
    thread.start()
    plot.run()

    # 确保线程结束
    thread.wait()
