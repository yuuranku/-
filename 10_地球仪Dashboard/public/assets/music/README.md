# PALIS 公共曲库部署接口

把要随网站部署的音乐文件放在这个目录，并在 `palis-playlist.json` 中登记：

```json
{
  "tracks": [
    { "title": "极地电台", "src": "/assets/music/polar-radio.mp3" }
  ]
}
```

这是公共曲库：请把音频文件交给书记官，由书记官放入此目录、登记曲目清单并执行部署。部署完成后，所有访问者都会读取并播放同一份曲库。
