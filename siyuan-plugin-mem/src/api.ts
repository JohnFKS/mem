/** 思源内核 API 调用封装 (POST JSON) */
export async function fetchSyncPost(url: string, data: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return await res.json();
}

/** 取块的 kramdown 源码 */
export async function getBlockKramdown(id: string): Promise<string> {
  const res = await fetchSyncPost("/api/block/getBlockKramdown", { id });
  return (res && res.data && res.data.kramdown) || "";
}
