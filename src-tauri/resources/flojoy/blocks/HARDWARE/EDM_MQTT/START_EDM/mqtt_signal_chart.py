from mqtt import EDMMQTTClient
import matplotlib.pyplot as plt
from datetime import datetime
import math
import argparse
import os


def set_state(edm_state: str):
    """设置状态为 Running 或 Stopped"""
    valid_states = {"Running", "Stopped"}
    if edm_state not in valid_states:
        raise ValueError(f"非法状态: {edm_state}")

    # 使用临时文件确保原子性写入
    temp_file = "status.tmp"
    final_file = "status.txt"
    try:
        with open(temp_file, "w") as f:
            f.write(edm_state)
        # 原子操作：重命名临时文件为目标文件
        os.replace(temp_file, final_file)
        print(f"状态已更新为: {edm_state}")
    except Exception as e:
        print(f"写入状态失败: {e}")


# 初始化存储数据的列表
time_temp = []
control_temp = []
target_temp = []
time_vib = []
control_vib = []
target_vib = []

# 创建实时图表
plt.ion()  # 开启交互模式
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8))
fig.suptitle('Real-time Monitoring')

# 解析命令行参数
parser = argparse.ArgumentParser(description='MQTT Signal Monitoring Script')
parser.add_argument('broker', type=str, default='localhost', help='MQTT Broker IP address')
args = parser.parse_args()

# 连接MQTT Broker
mqttClient = EDMMQTTClient(client_id="python client", topic_prefix="EDM", broker=args.broker)
mqttClient.connect_mqtt()

while not mqttClient.connected:
    pass

mqttClient.run_test()
print("=============================")

while mqttClient.test_status != 'Running':
    pass

set_state("Running")
print("开始初始化图表")
# 初始化图表的line对象
line_temp, = ax1.plot([], [], 'b-', label='Temperature')
line_target_temp, = ax1.plot([], [], 'g-', label='Target Temperature')
line_vib, = ax2.plot([], [], 'r-', label='Vibration')
line_target_vib, = ax2.plot([], [], 'g-', label='Target Vibration')

ax1.set_title('Temperature Control')
ax1.set_xlabel('Total Time (s)')
ax1.set_ylabel('Temperature (°C)')
ax1.grid(True)
ax1.legend()

ax2.set_title('Vibration Control')
ax2.set_xlabel('Total Time (s)')
ax2.set_ylabel('Vibration (g)')
ax2.grid(True)
ax2.legend()

plt.tight_layout()

mqttClient.request_detail_status()


def is_timestamp_valid(timestamp_str, max_diff_seconds=60):
    """检查给定的时间戳是否在有效时间范围内"""
    timestamp_obj = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
    time_diff = datetime.now() - timestamp_obj
    return time_diff.total_seconds() < max_diff_seconds


def get_shared_time_range(_time_temp, _time_vib):
    """获取统一的时间范围，最小时间到最大时间"""
    all_times = sorted(set(_time_temp + _time_vib))
    return all_times[0], all_times[-1]


try:
    while mqttClient.test_status != 'Stopped':
        print(f"当前状态: {mqttClient.test_status}")

        if mqttClient.th_status_list:
            th_signal = mqttClient.th_status_list[-1]
            print(f"温度信号: {th_signal}")
            timestamp = th_signal.get("Timestamp")

            if is_timestamp_valid(timestamp):
                # 处理温度数据
                temp_value = th_signal.get("ControlTemperature")
                target_temp_value = th_signal.get("TargetTemperature")  # 获取目标温度
                try:
                    temp_float = float(temp_value)
                    if not math.isnan(temp_float):
                        time_temp.append(th_signal["TotalTime"])
                        control_temp.append(temp_float)
                except (ValueError, TypeError):
                    print(f"无效的温度数据: {temp_value}")

                try:
                    target_temp_float = float(target_temp_value)
                    if not math.isnan(target_temp_float):
                        target_temp.append(target_temp_float)
                except (ValueError, TypeError):
                    print(f"无效的目标温度数据: {target_temp_value}")

        if mqttClient.vib_status_list:
            vib_signal = mqttClient.vib_status_list[-1]
            print(f"震动信号: {vib_signal}")
            timestamp = vib_signal.get("Timestamp")

            if is_timestamp_valid(timestamp):
                # 处理振动数据
                vib_value = vib_signal.get("ControlVibration")
                target_vib_value = vib_signal.get("TargetVibration")  # 获取目标振动
                try:
                    if math.isnan(vib_value):
                        vib_value = 0.0
                    vib_float = float(vib_value)
                    time_vib.append(vib_signal["TotalTime"])
                    control_vib.append(vib_float)
                except (ValueError, TypeError):
                    print(f"无效的振动数据: {vib_value}")

                try:
                    target_vib_float = float(target_vib_value)
                    if not math.isnan(target_vib_float):
                        target_vib.append(target_vib_float)
                except (ValueError, TypeError):
                    print(f"无效的目标振动数据: {target_vib_value}")

        # 获取统一的时间范围
        if len(time_temp) > 0 and len(time_vib) > 0:
            min_time, max_time = get_shared_time_range(time_temp, time_vib)
            # 设置统一的时间轴范围
            ax1.set_xlim(min_time, max_time)
            ax2.set_xlim(min_time, max_time)

        # 更新温度图表
        line_temp.set_xdata(time_temp)
        line_temp.set_ydata(control_temp)

        # 更新目标温度图表
        line_target_temp.set_xdata(time_temp)
        line_target_temp.set_ydata(target_temp)

        # 更新振动图表
        line_vib.set_xdata(time_vib)
        line_vib.set_ydata(control_vib)

        # 更新目标振动图表
        line_target_vib.set_xdata(time_vib)
        line_target_vib.set_ydata(target_vib)

        # 重新调整坐标轴范围
        ax1.relim()
        ax1.autoscale_view()

        ax2.relim()
        ax2.autoscale_view()

        plt.draw()
        plt.pause(0.1)  # 短暂暂停以更新图表

    if mqttClient.test_status == 'Stopped':
        set_state("Stopped")
except KeyboardInterrupt:
    print("Monitoring stopped by user")

finally:
    # 保存最终图表
    # plt.ioff()
    # fig.savefig(f'monitoring_{datetime.now().strftime("%Y%m%d_%H%M%S")}.png')
    # print("Monitoring data saved to PNG")
    plt.show()
