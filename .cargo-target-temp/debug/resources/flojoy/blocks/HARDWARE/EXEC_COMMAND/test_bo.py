import numpy as np
import pyqtgraph as pg
from pyqtgraph.Qt import QtCore, QtWidgets
import sys
import math


class RealTimePlot:
    def __init__(self):
        # 创建应用程序和窗口
        self.app = QtWidgets.QApplication(sys.argv)  # 使用 QtWidgets.QApplication
        self.win = pg.GraphicsLayoutWidget(show=True)
        self.win.setWindowTitle('实际波形 vs 理想波形')
        self.win.resize(1000, 600)

        # 创建绘图区域
        self.plot = self.win.addPlot(title="波形对比")
        self.plot.setLabel('left', '幅度')
        self.plot.setLabel('bottom', '时间')
        self.plot.addLegend()
        self.plot.showGrid(x=True, y=True)

        # 初始化曲线
        self.actual_curve = self.plot.plot(pen='r', name="实际波形")
        self.ideal_curve = self.plot.plot(pen='g', name="理想波形")

        # 数据缓冲区
        self.buffer_size = 500
        self.x_data = np.arange(self.buffer_size)
        self.actual_data = np.zeros(self.buffer_size)
        self.ideal_data = np.zeros(self.buffer_size)

        # 计数器
        self.counter = 0

        # 设置定时器
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update)
        self.timer.start(50)  # 每50ms更新一次

    def update(self):
        # 生成新的数据点
        t = self.counter / 10.0
        new_actual = np.sin(t * 2 * math.pi * 4) + 0.2 * np.random.normal()  # 实际波形带噪声
        new_ideal = np.sin(t * 2 * math.pi * 4)  # 理想波形

        # 更新数据缓冲区
        self.actual_data[:-1] = self.actual_data[1:]
        self.ideal_data[:-1] = self.ideal_data[1:]
        self.actual_data[-1] = new_actual
        self.ideal_data[-1] = new_ideal

        # 更新曲线数据
        self.actual_curve.setData(self.x_data, self.actual_data)
        self.ideal_curve.setData(self.x_data, self.ideal_data)

        # 自动调整视图范围
        self.plot.enableAutoRange('xy', False)
        self.plot.setXRange(0, self.buffer_size)

        self.counter += 1

    def run(self):
        # 启动应用程序
        if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
            QtWidgets.QApplication.instance().exec_()  # 使用 QtWidgets.QApplication


if __name__ == '__main__':
    plot = RealTimePlot()
    plot.run()
