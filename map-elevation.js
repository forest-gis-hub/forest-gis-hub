const elevationProfile = (() => {
  'use strict';

  const panel = document.getElementById('elevation-profile');
  const summary = document.getElementById('elevation-summary');
  const chart = document.getElementById('elevation-chart');
  const details = document.getElementById('elevation-details');
  const sources = [['dem5a_png',15],['dem5b_png',15],['dem5c_png',15],['dem_png',14]];
  const tileRoot = 'https://cyberjapandata.gsi.go.jp/xyz/';
  const maxDistance = 50000;
  const maxIntervals = 100;
  let currentRequest;

  function decodeElevation(red, green, blue) {
    const value = red * 65536 + green * 256 + blue;
    if (value === 8388608) return null;
    return (value < 8388608 ? value : value - 16777216) / 100;
  }

  async function readTile(url, signal) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, {
        signal:AbortSignal.any([signal,AbortSignal.timeout(6000)]), credentials:'omit'
      });
      if (!response.ok) return null;
      const image = await createImageBitmap(await response.blob(), {
        colorSpaceConversion:'none', premultiplyAlpha:'none'
      });
      try {
        if (image.width !== 256 || image.height !== 256) return null;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const context = canvas.getContext('2d');
        context.drawImage(image,0,0);
        return context.getImageData(0,0,256,256).data;
      } finally {
        image.close();
      }
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }

  async function elevationAt(point, tiles, signal) {
    for (const [source, zoom] of sources) {
      const pixel = map.project(point, zoom).floor();
      const tileCount = 2 ** zoom;
      const x = ((Math.floor(pixel.x/256) % tileCount) + tileCount) % tileCount;
      const y = Math.floor(pixel.y/256);
      if (y < 0 || y >= tileCount) return null;
      const url = tileRoot + source + '/' + zoom + '/' + x + '/' + y + '.png';
      if (!tiles.has(url)) tiles.set(url, readTile(url, signal));
      const rgba = await tiles.get(url);
      if (!rgba) continue;
      const index = (256 * (pixel.y - y*256) + (pixel.x % 256 + 256) % 256) * 4;
      const elevation = decodeElevation(rgba[index],rgba[index+1],rgba[index+2]);
      if (elevation !== null && rgba[index+3]) return elevation;
    }
    return null;
  }

  function sampleLine(points) {
    const segments = [];
    let length = 0;
    for (let i=1;i<points.length;i++) {
      const meters = points[i-1].distanceTo(points[i]);
      if (meters < 0.01) continue;
      segments.push({start:length,meters,a:points[i-1],b:points[i]});
      length += meters;
    }
    if (length < 2) throw new Error('2 m以上の線を引いてください。');
    if (length > maxDistance) throw new Error('50 km以内の線で計測してください。');
    const intervals = Math.max(1, Math.min(maxIntervals,Math.ceil(length/25)));
    let segmentIndex = 0;
    return Array.from({length:intervals+1},(_,i)=>{
      const distance = length*i/intervals;
      while (segmentIndex < segments.length-1 &&
        distance > segments[segmentIndex].start+segments[segmentIndex].meters) segmentIndex++;
      const {start,meters,a,b} = segments[segmentIndex];
      if (i===0) return {distance,point:a};
      if (i===intervals) return {distance,point:b};
      const ratio = (distance-start)/meters;
      const lngDelta = ((b.lng-a.lng+180)%360+360)%360-180;
      return {distance,point:L.latLng(a.lat+(b.lat-a.lat)*ratio,a.lng+lngDelta*ratio)};
    });
  }

  function svg(tag, attributes, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const metersLabel = value => value.toLocaleString('ja-JP',{maximumFractionDigits:1}) + ' m';
  const percent = value => (value > 0 ? '+' : '') + value.toFixed(1) + '%';

  function render(samples, spacing) {
    const valid = samples.filter(sample=>sample.elevation!==null);
    if (!valid.length) {
      summary.textContent='標高を取得できませんでした。データの提供範囲と通信状態を確認してください。';
      return;
    }
    const first = samples[0];
    const last = samples.at(-1);
    const low = Math.floor(Math.min(...valid.map(p=>p.elevation)));
    const high = Math.max(low+1, Math.ceil(Math.max(...valid.map(p=>p.elevation))));
    const complete = valid.length === samples.length;
    const grade = first.elevation===null || last.elevation===null ? null
      : (last.elevation-first.elevation)/last.distance*100;
    let climb=0, descent=0, steepest=null;
    let path='', previous=null;
    for (const sample of samples) {
      if (sample.elevation===null) {
        previous=null;
        continue;
      }
      const x=55+sample.distance/last.distance*264;
      const y=98-(sample.elevation-low)/(high-low)*84;
      path+=(previous?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);
      if (previous) {
        const delta=sample.elevation-previous.elevation;
        const slope=100*delta/(sample.distance-previous.distance);
        climb+=Math.max(0,delta);
        descent+=Math.max(0,-delta);
        if (steepest===null || Math.abs(slope)>Math.abs(steepest)) steepest=slope;
      }
      previous=sample;
    }
    summary.textContent='始点→終点の平均勾配 '+(grade===null?'取得不可':percent(grade));
    details.textContent=[
      '水平距離 '+formatLength(last.distance),
      '始点 '+(first.elevation===null?'—':metersLabel(first.elevation))+' ／ 終点 '+(last.elevation===null?'—':metersLabel(last.elevation)),
      ...(steepest===null?[]:['最も急な区間 '+percent(steepest)]),
      ...(complete?['累積 上り '+metersLabel(climb)+' ／ 下り '+metersLabel(descent)]:['標高なし '+(samples.length-valid.length)+'地点']),
      '間隔 約'+metersLabel(spacing)
    ].join(' · ');
    chart.append(
      svg('path',{d:'M55 14V98H319',fill:'none',stroke:'#a0b3a5'}),
      svg('text',{x:51,y:18,'text-anchor':'end'},high+' m'),
      svg('text',{x:51,y:101,'text-anchor':'end'},low+' m'),
      svg('text',{x:55,y:115},'0'),
      svg('text',{x:319,y:115,'text-anchor':'end'},formatLength(last.distance)),
      svg('path',{d:path,fill:'none',stroke:'#216546','stroke-width':2.5,'stroke-linecap':'round'})
    );
    chart.removeAttribute('hidden');
  }

  function clear() {
    currentRequest?.abort();
    currentRequest=undefined;
    panel.hidden=true;
    chart.setAttribute('hidden','');
    chart.replaceChildren();
    summary.textContent='';
    details.textContent='';
  }

  async function run(points) {
    clear();
    panel.hidden=false;
    summary.textContent='標高データを取得中…';
    const request=new AbortController();
    currentRequest=request;
    try {
      const samples=sampleLine(points);
      const tiles=new Map();
      let next=0;
      async function worker() {
        while (next<samples.length) {
          request.signal.throwIfAborted();
          const sample=samples[next++];
          sample.elevation=await elevationAt(sample.point,tiles,request.signal);
        }
      }
      await Promise.all(Array.from({length:Math.min(6,samples.length)},worker));
      if (currentRequest===request) render(samples,samples.at(-1).distance/(samples.length-1));
    } catch (error) {
      if (currentRequest===request) summary.textContent=error.message;
    }
  }

  return {run,clear};
})();
