import tkinter as tk
from tkinter import messagebox
from typing import Optional
from flojoy import String, flojoy, DataContainer


class StrictDialog:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("波形检测")
        self.root.geometry("300x150")
        self._setup_window()
        self.selection = tk.StringVar()
        self._create_widgets()

    def _setup_window(self):
        """窗口属性设置"""
        # 方案一：保留标题栏但禁用关闭功能（推荐）
        self.root.protocol('WM_DELETE_WINDOW', self._block_close)

        # 方案二：完全移除标题栏（需配合手动关闭）
        # self.root.overrideredirect(True)  # 移除所有窗口装饰
        # self.root.geometry("+300+200")    # 必须手动设置初始位置

        # 禁用窗口缩放
        self.root.resizable(False, False)

    def _block_close(self):
        """拦截关闭操作"""
        messagebox.showwarning("禁止关闭", "请选择正常或异常按钮！")

    def _create_widgets(self):
        # 控件布局（与之前示例类似）
        label = tk.Label(self.root, text="脉冲器波形是否正常", font=('Arial', 12))
        label.pack(pady=20)

        button_frame = tk.Frame(self.root)
        button_frame.pack()

        btn_normal = tk.Button(button_frame, text="正常", width=8,
                               command=lambda: self._set_result("正常"))
        btn_normal.pack(side=tk.LEFT, padx=10)

        btn_abnormal = tk.Button(button_frame, text="异常", width=8,
                                 command=lambda: self._set_result("异常"))
        btn_abnormal.pack(side=tk.RIGHT, padx=10)

    def _set_result(self, value):
        self.selection.set(value)
        self.root.destroy()

    def get_result(self):
        self.root.mainloop()
        return self.selection.get() if self.selection.get() else "未选择"


@flojoy
def WAVEFORM_CONFIRMATION(
        default: Optional[DataContainer] = None,
) -> String:
    dlg = StrictDialog()
    return String(s=dlg.get_result())
