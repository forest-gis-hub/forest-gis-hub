# Forest GIS Hub

森林・林業・GISに関する公開データ、現場の事例、技術資料を探せる個人運営の情報サイトです。見つけた資料を読んだり、地図に重ねて現地の状況を調べたりできます。

**[公開サイトを開く](https://forest-gis-hub.pages.dev/)**

## サイトでできること

| ページ | 内容 |
| --- | --- |
| [Library｜リンク集](https://forest-gis-hub.pages.dev/library.html) | 森林・林業、地形、GISデータ、衛星画像などの公開情報を、カテゴリとキーワードで探せます。 |
| [Map｜地図ビューア](https://forest-gis-hub.pages.dev/map.html) | 地形図・年代別空中写真・地質図などを重ねて比較できます。アメダス観測所の検索、距離・面積・勾配の計測、ポリゴンの作成、外部XYZタイルやGeoJSONの取り込みにも対応しています。 |
| [Journal｜記事](https://forest-gis-hub.pages.dev/articles/index.html) | QGISの基本操作や地図データの読み込み方を、入門シリーズで紹介しています。 |
| [公開データ](https://forest-gis-hub.pages.dev/data/index.html) | 福岡県の国有林区域を表示するXYZタイルのURLと、QGISへの登録手順を掲載しています。 |

### 地図ビューアで取得できるデータ

- [全国のアメダス観測所（GeoJSON）](https://forest-gis-hub.pages.dev/data/amedas-stations.geojson)。気象庁の公開データをもとに、観測所名と座標を収録しています。
- [能古島の国有林野施業実施計画図（GeoTIFF）](https://forest-gis-hub.pages.dev/data/nokonoshima-forest-plan.tif)。九州森林管理局の公開図面を切り出し、地理院地図を基準に位置を合わせた試作です。図面の位置は目安です。

再利用するときは、各データの出典と提供元の利用条件を確認してください。

## ローカルで確認する

HTML・CSS・JavaScriptで構成された静的サイトです。リポジトリのルートで Python 3 の簡易サーバーを起動し、ブラウザで http://localhost:8000/ を開きます。記事一覧はJSONを読み込むため、ローカルでもHTTP経由で確認できます。外部の地図タイルや画像の表示にはインターネット接続が必要です。

```sh
python -m http.server 8000
```

サイト本体はCloudflare Pagesで公開し、福岡県の国有林区域のXYZタイルはGitHub Pagesで配信しています。
