class TbusCommandUtils:

    @staticmethod
    def _split_and_organize(en_str: str, spl_type: int):
        if spl_type == 2:
            # 将字符串按6个一组分割
            split_list = [en_str[i:i + 6] for i in range(0, len(en_str), 6)]
            heads = []  # 存放每个分组的第一个字符
            tails = []  # 存放每个分组的最后一个字符
            # 收集首位
            if len(split_list) > 2:
                heads = split_list[0:-1]
            # 收集末位（当长度≥1时与首位相同，长度≥2时不同）
            tails.append(split_list[-1])
            return heads, tails
        else:
            # 将字符串按4个一组分割
            split_list = [en_str[i:i + 4] for i in range(0, len(en_str), 4)]
            heads = []  # 存放每个分组的第一个字符
            middles = []  # 存放每个分组的中间部分
            tails = []  # 存放每个分组的最后一个字符
            # 收集首位（必存在）
            heads.append(split_list[0])
            # 收集中间部分（可能为空）
            if len(split_list) > 2:
                middles = split_list[1:-1]
            # 收集末位（当长度≥1时与首位相同，长度≥2时不同）
            if split_list[0] != split_list[-1]:
                tails.append(split_list[-1])
            return heads, middles, tails

    @staticmethod
    def _binary_to_hex_with_padding(binary_str):
        # 计算需要补齐的位数（使总长度是4的倍数）
        padding = (4 - (len(binary_str) % 4)) % 4
        padded_binary = '0' * padding + binary_str

        # 每4位转换为1个十六进制字符
        hex_str = ''.join([
            '{:x}'.format(int(padded_binary[i:i + 4], 2))
            for i in range(0, len(padded_binary), 4)
        ])

        return '0x' + hex_str.zfill(len(padded_binary) // 4)

    @staticmethod
    def _decrypt(data):
        try:
            data_str = ''
            for value in data:
                binary_number = bin(int(value, 16))  # 转换为整数后，再转为二进制
                binary_number = binary_number[2:].zfill(24)  # 转为二进制，并保证24位数
                part1 = binary_number[:8]  # 前 4 位
                part2 = binary_number[8:16]  # 中间 6 位
                part3 = binary_number[16:]  # 最后 6 位
                binary = part1[4:] + part2[2:] + part3[2:]  # 加密
                str_value = TbusCommandUtils._binary_to_hex_with_padding(binary)  # 转为十六进制
                data_str += str_value[2:].upper()  # 删除前两位代表十六进制的应为，并让字母大写
            return data_str
        except Exception as e:
            print(f"error_message: {e}")
            return False

    @staticmethod
    def _encrypt(data, encry_type):
        try:
            data_str = ''
            for value in data:
                binary_number = bin(int(value, 16))  # 转换为整数后，再转为二进制
                binary_number = binary_number[2:].zfill(16)  # 转为二进制，并保证16位数
                part1 = binary_number[:4]  # 前 4 位
                part2 = binary_number[4:10]  # 中间 6 位
                part3 = binary_number[10:]  # 最后 6 位
                binary = encry_type[0] + part1 + encry_type[1] + part2 + encry_type[2] + part3  # 加密
                str_value = TbusCommandUtils._binary_to_hex_with_padding(binary)  # 转为十六进制
                data_str += str_value[2:].upper()  # 删除前两位代表十六进制的应为，并让字母大写

            return data_str
        except Exception as e:
            print(f"error_message: {e}")
            return False

    @staticmethod
    def serial2tbus(en_str: str):
        """
        将串口返回的数据转为TBUS返回
        """
        heads, tails = TbusCommandUtils._split_and_organize(en_str, 2)
        heads_str = ''
        tails_str = ''

        if heads:
            heads_str = TbusCommandUtils._decrypt(heads)
        if tails:
            tails_str = TbusCommandUtils._decrypt(tails)

        return heads_str + tails_str

    @staticmethod
    def tbus2serial(en_str: str):
        """
        将TBUS的请求指令转为串口指令
        """
        heads, middles, tails = TbusCommandUtils._split_and_organize(en_str, 1)
        heads_str = ''
        middles_str = ''
        tails_str = ''

        if heads:
            heads_str = TbusCommandUtils._encrypt(heads, ['0100', '10', '11'])
        if middles:
            middles_str = TbusCommandUtils._encrypt(middles, ['0000', '10', '11'])
        if tails:
            tails_str = TbusCommandUtils._encrypt(tails, ['0010', '10', '11'])
        return heads_str + middles_str + tails_str
