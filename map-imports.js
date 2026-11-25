(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const sourceLimit = 5 * 1024 * 1024;
  const added = new Set();
  const amedasToggle = byId('amedas-toggle');
  const stationPanel = byId('station-search-panel');
  const search = byId('station-search');
  const results = byId('station-results');
  const stationStatus = byId('station-status');
  const importStatus = byId('import-status');
  let stationLayer;
  let stationRequest;
  const stations = [];
  const normalize = text => text.normalize('NFKC').toLowerCase()
    .replace(/[\u3041-\u3096]/g, char => String.fromCharCode(char.charCodeAt(0)+0x60)).trim();
  const stationSource = 'https://www.jma.go.jp/bosai/amedas/const/amedastable.json';

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function stationPopup(station, latlng) {
    const popup = element('div');
    const coordinates = latlng.lat.toFixed(6) + ', ' + latlng.lng.toFixed(6);
    const heading = element('strong', station.name);
    const position = element('p', '緯度・経度：' + coordinates);
    const details = ['観測所番号 ' + station.id];
    if (Number.isFinite(station.elevation)) details.push('標高 ' + station.elevation + ' m');
    const copy = element('button', '座標をコピー');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(coordinates);
        copy.textContent = 'コピーしました';
      } catch {
        copy.textContent = 'コピーできませんでした';
      }
    });
    const save = element('button', 'この観測所をGeoJSONで保存');
    save.type = 'button';
    save.addEventListener('click', () => {
      const feature = {
        type:'Feature', id:station.id,
        geometry:{type:'Point', coordinates:[latlng.lng,latlng.lat]},
        properties:{...station},
        source:stationSource, retrieved:'2026-11-25'
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(feature,null,2)],{type:'application/geo+json'}));
      const link = element('a');
      link.href = url;
      link.download = 'amedas-'+station.id+'.geojson';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const values = element('a', '気象庁で過去の観測値をダウンロード ↗');
    values.href = 'https://www.data.jma.go.jp/risk/obsdl/';
    values.target = '_blank';
    values.rel = 'noopener noreferrer';
    const actions = element('p');
    actions.append(save);
    const history = element('p');
    history.append(values);
    popup.append(heading, element('div', details.join(' ／ ')), position, copy, actions, history);
    return popup;
  }

  async function readGeoJSON(response) {
    if (!response.ok) throw new Error('データを取得できませんでした。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > sourceLimit) {
        await reader.cancel();
        throw new Error('5 MB以下のGeoJSONを指定してください。');
      }
      text += decoder.decode(value, {stream:true});
    }
    return JSON.parse(text + decoder.decode());
  }

  function loadStations() {
    if (!stationRequest) {
      const dataRequest = location.protocol === 'file:'
        ? new Promise((resolve, reject) => {
            const script = element('script');
            script.src = './data/amedas-stations-local.js';
            script.addEventListener('load', () => {
              const data = window.forestGisAmedasSnapshot;
              delete window.forestGisAmedasSnapshot;
              script.remove();
              if (data) resolve(data); else reject(new Error('観測所データが見つかりません。'));
            });
            script.addEventListener('error', () => {
              script.remove();
              reject(new Error('観測所を読み込めませんでした。'));
            });
            document.head.append(script);
          })
        : fetch('./data/amedas-stations.geojson').then(readGeoJSON);
      stationRequest = dataRequest
        .then(data => {
          stationLayer = L.geoJSON(data, {
            pointToLayer: (feature, position) => L.circleMarker(position, {
              radius:5, color:'#fff', weight:1.5, fillColor:'#156aa9', fillOpacity:1
            }),
            onEachFeature(feature, marker) {
              const station = feature.properties;
              const latlng = marker.getLatLng();
              marker.bindPopup(() => stationPopup(station, latlng));
              marker.bindTooltip(() => element('span', station.name));
              stations.push({station, marker});
            }
          });
        })
        .catch(error => {
          stationRequest = undefined;
          throw error;
        });
    }
    return stationRequest;
  }

  amedasToggle.addEventListener('change', async () => {
    if (!amedasToggle.checked) {
      if (stationLayer) map.removeLayer(stationLayer);
      stationPanel.hidden = true;
      stationStatus.textContent = '';
      return;
    }
    stationStatus.textContent = '観測所を読み込み中…';
    try {
      await loadStations();
      if (!amedasToggle.checked) return;
      stationLayer.addTo(map);
      stationPanel.hidden = false;
      stationStatus.textContent = stations.length + '地点を表示中';
      renderStations();
    } catch {
      amedasToggle.checked = false;
      stationPanel.hidden = true;
      stationStatus.textContent = '観測所を読み込めませんでした。ページを再読み込みしてお試しください。';
    }
  });

  function renderStations() {
    const query = normalize(search.value);
    results.replaceChildren();
    if (!query) {
      stationStatus.textContent = stations.length + '地点を表示中';
      return;
    }
    const matches = stations.filter(({station}) =>
      [station.name, station.kana, station.english, station.id].some(value => normalize(value).includes(query)));
    for (const {station, marker} of matches.slice(0, 20)) {
      const button = element('button', station.name + '（' + station.id + '）');
      button.type = 'button';
      button.addEventListener('click', () => {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 11));
        marker.openPopup();
        if (window.matchMedia('(max-width:700px)').matches) {
          document.getElementById('map').scrollIntoView({block:'start'});
        }
      });
      const item = element('li');
      item.append(button);
      results.append(item);
    }
    stationStatus.textContent = matches.length
      ? matches.length + '件' + (matches.length > 20 ? '（先頭20件を表示）' : '')
      : '一致する観測所がありません。';
  }
  search.addEventListener('input', renderStations);

  function publicHttps(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('認証情報や # を含まないHTTPSのURLを指定してください。');
    }
    return url;
  }

  function registerLayer(layer, name, credit, {release, download} = {}) {
    const item = element('li');
    const label = element('label');
    const visible = element('input');
    visible.type = 'checkbox';
    visible.checked = true;
    label.append(visible, ' ' + name);
    const remove = element('button', '削除');
    remove.type = 'button';
    remove.setAttribute('aria-label', name + 'を削除');
    const entry = {layer, visible, credit};
    visible.addEventListener('change', () => {
      if (visible.checked) layer.addTo(map);
      else map.removeLayer(layer);
    });
    remove.addEventListener('click', () => {
      map.removeLayer(layer);
      added.delete(entry);
      release?.();
      item.remove();
      importStatus.textContent = name + 'を削除しました。';
    });
    item.append(label);
    const actions=element('div');
    actions.className='added-layer-actions';
    if(download){
      const link=element('a','GeoJSON');
      link.href=download;
      link.download=name+'.geojson';
      link.setAttribute('aria-label',name+'のGeoJSONを保存');
      actions.append(link);
    }
    let opacityButton;
    if (typeof layer.setOpacity === 'function') {
      opacityButton = element('button');
      opacityButton.type = 'button';
      actions.append(opacityButton);
    }
    actions.append(remove);
    item.append(actions);
    byId('imported-layers').append(item);
    byId('added-layers-panel').open=true;
    if (opacityButton) {
      const anchor = element('span');
      anchor.hidden = true;
      item.append(anchor);
      addInlineOpacity(opacityButton, anchor, name, 100, layer);
    }
    added.add(entry);
    layer.addTo(map);
  }

  const tileForm = byId('external-tile-form');
  tileForm.addEventListener('submit', event => {
    event.preventDefault();
    const template = byId('external-tile-url').value.trim();
    try {
      const tokens = template.match(/\{[^{}]+\}/g) || [];
      const endpoint = publicHttps(template.replace(/\{[zxy]\}/g, '0'));
      if (!['{z}','{x}','{y}'].every(token => tokens.includes(token)) ||
          tokens.some(token => !['{z}','{x}','{y}'].includes(token)) ||
          /[{}]/.test(template.replace(/\{[zxy]\}/g, ''))) {
        throw new Error('URLに {z}・{x}・{y} を指定してください。');
      }
      if (/\{/.test(template.split('/').slice(0,3).join('/'))) {
        throw new Error('タイル座標はURLのパスまたはクエリに指定してください。');
      }
      const name = byId('external-tile-name').value.trim() || endpoint.hostname;
      const credit = byId('external-tile-credit').value.trim() || endpoint.hostname;
      const zoom = byId('external-tile-zoom').value;
      const options = {pane:'historicPane', maxZoom:18, referrerPolicy:'no-referrer'};
      if (zoom !== '') options.maxNativeZoom = Number(zoom);
      const layer = L.tileLayer(template, options);
      let tileLoaded = false;
      layer.on('tileload', () => { tileLoaded = true; });
      layer.on('load', () => {
        if (!tileLoaded) importStatus.textContent = name + 'の画像が表示範囲にありません。URLやズームを確認してください。';
      });
      registerLayer(layer, name, credit);
      importStatus.textContent = name + 'を追加しました。';
      tileForm.reset();
    } catch (error) {
      importStatus.textContent = error instanceof TypeError ? '有効なHTTPSのXYZタイルURLを入力してください。' : error.message;
    }
  });

  function makeVectorLayer(data) {
    const types = new Set(['FeatureCollection','Feature','GeometryCollection','Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon']);
    if (!data || !types.has(data.type) || data.crs) throw new Error('WGS 84のGeoJSONを指定してください。');
    const layer = L.geoJSON(data, {
      style:{color:'#a13e87', weight:3, fillOpacity:.2},
      pointToLayer: (feature, position) => L.circleMarker(position, {radius:6, color:'#a13e87', fillOpacity:.8}),
      onEachFeature(feature, item) {
        const name = feature.properties?.name;
        if (typeof name === 'string' && name) item.bindPopup(() => element('span', name.slice(0, 200)));
      }
    });
    const bounds = layer.getBounds();
    if (!bounds.isValid() || [bounds.getSouth(),bounds.getNorth()].some(n => !Number.isFinite(n) || Math.abs(n)>90) ||
        [bounds.getWest(),bounds.getEast()].some(n => !Number.isFinite(n) || Math.abs(n)>180)) {
      throw new Error('有効な緯度・経度を持つ地物が見つかりませんでした。');
    }
    return layer;
  }

  const geoForm = byId('external-geo-form');
  geoForm.addEventListener('submit', async event => {
    event.preventDefault();
    const file = byId('external-geo-file').files[0];
    const value = byId('external-geo-url').value.trim();
    const submit = byId('external-geo-submit');
    if ((!file && !value) || (file && value)) {
      importStatus.textContent = 'URLかファイルのどちらか一方を指定してください。';
      return;
    }
    submit.disabled = true;
    importStatus.textContent = 'GeoJSONを読み込み中…';
    try {
      if (file && file.size > sourceLimit) throw new Error('5 MB以下のGeoJSONを指定してください。');
      let data;
      let name;
      if (file) {
        data = JSON.parse(await file.text());
        name = file.name;
      } else {
        const url = publicHttps(value);
        data = await readGeoJSON(await fetch(url, {
          credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(15000)
        }));
        name = url.hostname;
      }
      const layer = makeVectorLayer(data);
      registerLayer(layer, name, file ? '' : name);
      map.fitBounds(layer.getBounds(), {padding:[20,20], maxZoom:14});
      importStatus.textContent = name + 'を追加しました。';
      geoForm.reset();
    } catch (error) {
      importStatus.textContent = error instanceof SyntaxError ? 'GeoJSONとして読み取れませんでした。'
        : error instanceof TypeError ? 'URLにアクセスできませんでした。公開URLと提供元のCORS設定を確認してください。'
        : error.name === 'TimeoutError' ? '読み込みがタイムアウトしました。' : error.message;
    } finally {
      submit.disabled = false;
    }
  });


  function polygonFeature(points, name) {
    const ring=points.map(point=>[point.lng,point.lat]);
    const distinct=new Set(ring.map(coordinate=>coordinate.join(',')));
    if(distinct.size<3 || areaMeters(points)<0.01) throw new Error('面積のある3点以上を指定してください。');
    const first=ring[0], last=ring.at(-1);
    if(first[0]!==last[0]||first[1]!==last[1]) ring.push(first.slice());
    const signed=ring.slice(1).reduce((sum,[lng,lat],i)=>{
      const [prevLng,prevLat]=ring[i];
      return sum+(prevLng-first[0])*(lat-first[1])-(lng-first[0])*(prevLat-first[1]);
    },0);
    if(signed<0)ring.reverse();
    return {type:'Feature',properties:{name},geometry:{type:'Polygon',coordinates:[ring]}};
  }

  let polygonNumber=1;
  byId('measure-save-polygon').addEventListener('click',()=>{
    const name='作成したポリゴン '+polygonNumber;
    try {
      const feature=polygonFeature(points,name);
      const layer=makeVectorLayer(feature);
      const download=URL.createObjectURL(new Blob([JSON.stringify(feature,null,2)],{type:'application/geo+json'}));
      registerLayer(layer,name,'',{download,release:()=>URL.revokeObjectURL(download)});
      polygonNumber++;
      clearMeasure();
      hintEl.textContent=name+'を追加しました。左側からGeoJSONを保存できます。';
    } catch(error) {
      hintEl.textContent=error.message;
    }
  });

  const planStatus=byId('plan-status');
  const planCorners={nw:null,se:null};
  let choosingCorner=null;
  let loadingPlan=false;
  function stopPicking(){
    choosingCorner=null;
    map.getContainer().classList.remove('picking-plan-corner');
  }
  for(const [key,label] of [['nw','左上'],['se','右下']]){
    byId('plan-pick-'+key).addEventListener('click',()=>{
      if(tool)setTool(tool);
      choosingCorner=key;
      map.getContainer().classList.add('picking-plan-corner');
      planStatus.textContent='地図上で画像の'+label+'に対応する位置をクリックしてください。';
      if(window.matchMedia('(max-width:700px)').matches)map.getContainer().scrollIntoView({block:'start'});
    });
  }
  for(const button of measureButtons)button.addEventListener('click',stopPicking);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && choosingCorner){
      stopPicking();
      planStatus.textContent='位置の指定を中止しました。';
    }
  });
  map.on('click',event=>{
    if(!choosingCorner)return;
    planCorners[choosingCorner]=event.latlng;
    stopPicking();
    const position=point=>point ? point.lat.toFixed(5)+', '+point.lng.toFixed(5) : '未指定';
    byId('plan-corners').textContent='左上 '+position(planCorners.nw)+' ／ 右下 '+position(planCorners.se);
    planStatus.textContent='位置を記録しました。';
  });

  function planBounds(nw,se){
    if(!nw||!se)throw new Error('左上と右下の両方を指定してください。');
    if(nw.lat<=se.lat||nw.lng>=se.lng)throw new Error('地図上で左上が北西、右下が南東になるように指定してください。');
    return L.latLngBounds([se.lat,nw.lng],[nw.lat,se.lng]);
  }
  byId('plan-image-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(loadingPlan)return;
    let url;
    try {
      const bounds=planBounds(planCorners.nw,planCorners.se);
      const file=byId('plan-image-file').files[0];
      if(!file||!/\.(png|jpe?g|webp)$/i.test(file.name)||file.size>20*1024*1024){
        throw new Error('20 MB以下のPNG・JPEG・WebP画像を選んでください。');
      }
      const credit=byId('plan-image-credit').value.trim();
      const name=file.name.replace(/\.[^.]+$/,'');
      loadingPlan=true;
      url=URL.createObjectURL(file);
      const image=new Image();
      image.src=url;
      await image.decode();
      const layer=L.imageOverlay(image,bounds,{opacity:1,pane:'historicPane',interactive:false});
      const retainedUrl=url;
      registerLayer(layer,name,credit,{release:()=>URL.revokeObjectURL(retainedUrl)});
      url=undefined;
      map.fitBounds(bounds,{padding:[16,16],maxZoom:16});
      planStatus.textContent='図面を追加しました。左側の「追加したレイヤ」で透明度を調整できます。';
    } catch(error) {
      planStatus.textContent=error.name==='EncodingError'?'画像を読み取れませんでした。':error.message;
    } finally {
      if(url)URL.revokeObjectURL(url);
      loadingPlan=false;
    }
  });

  byId('background-only').addEventListener('click', () => {
    amedasToggle.checked = false;
    amedasToggle.dispatchEvent(new Event('change'));
    for (const {layer, visible} of added) {
      visible.checked = false;
      map.removeLayer(layer);
    }
  });

  appendImportedCredits = credits => {
    if (stationLayer && map.hasLayer(stationLayer)) {
      const source = element('a', '気象庁 アメダス観測所データ');
      source.href = stationSource;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      credits.append(' | 出典：', source, '（Forest GIS Hubが座標形式を変換）');
    }
    const imported = new Set([...added].filter(entry => entry.credit && map.hasLayer(entry.layer)).map(entry => entry.credit));
    if (imported.size) credits.append(' | 外部データ：' + [...imported].join('、'));
  };
})();
