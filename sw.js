/* 執筆帖 — サービスワーカー
   起動を速くするため、画面の部品は手元の控えから即座に出し、
   裏で新しい版を取りに行きます。新しい版が届いたら画面に知らせます。 */
const CACHE = "shippitsucho-v2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function notifyUpdated(){
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: "updated" }));
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 同じ場所にある画面の部品だけを扱う。データベースや外部の部品には触れない
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    // 裏で新しいものを取りに行き、控えを更新する
    const refresh = fetch(req).then(async res => {
      if (!res || !res.ok) return res;
      const copy = res.clone();
      if (cached){
        // 本体（HTML）が変わっていたら画面に知らせる
        const isPage = req.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");
        if (isPage){
          const [a, b] = await Promise.all([cached.clone().text(), copy.clone().text()]);
          if (a !== b) notifyUpdated();
        }
      }
      await cache.put(req, copy);
      return res;
    }).catch(() => null);

    // 控えがあれば即座に返す（待たない）
    if (cached) return cached;
    // 無ければ通信を待つ。通信もだめなら本体を返す
    const fresh = await refresh;
    return fresh || (await cache.match("./index.html")) || Response.error();
  })());
});
