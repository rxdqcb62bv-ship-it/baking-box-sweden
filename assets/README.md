# assets 素材库

游戏通过 `assets/manifest.js` 按 key 引用素材，key = 文件名去掉扩展名。
替换素材：保持文件名与尺寸不变，直接覆盖即可；新增素材后运行 `python tools/build_manifest.py`。

## 目录
| 目录 | 前缀 | 内容 |
|---|---|---|
| sprites/characters | char_ | 客人精灵表（28x44，8 帧：走路 4 + 站立/开心/不耐烦/生气）、头像 |
| sprites/stations | station_ / tool_ | 工位（发酵柜、烤箱有 待机/工作 两态；垃圾桶 关/开盖）、工具 |
| sprites/ingredients | ing_ | 配料罐 |
| sprites/food | food_ | 面团 3 态、肉桂卷 生/浅/金黄/焦 4 态、蛋液与珍珠糖覆盖层、烤盘、餐盘 |
| sprites/ui | ui_ | 口味标签、星星、硬币、印章、箭头、鼠标指针、热气球 |
| sprites/fx | fx_ | 特效帧条（面粉、蒸汽、闪光、烟，各 4 帧） |
| sprites/backgrounds | bg_ | 480x270 背景：标题、地图、前厅、前厅柜台层、后厨 |
| audio/sfx | sfx_ | 门铃、揉面、擀面、刷、切、烤箱叮、完美/不错/失误、扔垃圾、买东西、旋钮等 |
| audio/bgm | bgm_ | 面包店循环曲、结算短乐句 |

## 风格规范
- 逻辑分辨率 480x270，整数倍放大，最近邻缩放。
- 统一 1px 深棕描边 #4A3028，透明背景。
- 瑞典篇主色：蓝 #346EB2、黄 #FCCE40、法鲁红 #B2342C、奶油 #FFF6E4。

## 来源
全部由 `tools/make_sprites.py`、`tools/make_audio.py` 程序生成，原创，无外部素材。
