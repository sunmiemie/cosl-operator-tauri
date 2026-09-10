# Tauri + Vue + TypeScript

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## WindowAgent 文件接收

设置页可启用内置 HTTP 文件接收服务，配置监听地址、端口和接收根目录，并生成
供 WindowAgent 使用的长期共享令牌。服务支持每批最多 10 个文件、单文件最大
1 GiB 的分片上传。验证完成的文件按服务端本地日期保存到 `yyyyMMdd` 子目录；
同名文件自动编号且不会覆盖已有文件。
