const DRAFT_ONLY = true; // SAFETY: Never change this

const NAVER_API_BASE = "https://openapi.naver.com";

export async function saveDraft(params: {
  title: string;
  content: string;
  blogId: string;
  accessToken: string;
}): Promise<{ success: boolean; postId?: string; error?: string }> {
  if (!DRAFT_ONLY) throw new Error("SAFETY: Publishing is disabled");

  const { title, content, accessToken } = params;

  const body = new URLSearchParams({
    title,
    contents: content,
    categoryNo: "0",
    isOpenPost: "false", // draft — not publicly visible
    tag: "",
  });

  const response = await fetch(`${NAVER_API_BASE}/blog/writePost.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${text}` };
  }

  const json = (await response.json()) as { postId?: string; result?: string };
  return { success: true, postId: json.postId };
}

export async function getCategories(
  blogId: string,
  accessToken: string
): Promise<{ categoryNo: string; categoryName: string }[]> {
  const url = new URL(`${NAVER_API_BASE}/blog/listCategory.json`);
  url.searchParams.set("blogId", blogId);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as {
    categories?: { categoryNo: string; categoryName: string }[];
  };
  return json.categories ?? [];
}
