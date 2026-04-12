"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Save, Store, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Shop } from "@/types";

export default function AdminPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBlogId, setNewBlogId] = useState("");
  const [editName, setEditName] = useState("");
  const [editBlogId, setEditBlogId] = useState("");

  const loadShops = useCallback(async () => {
    try {
      const res = await fetch("/api/shops");
      const json = (await res.json()) as { success: boolean; data: Shop[] };
      if (json.success) {
        setShops(json.data);
      }
    } catch {
      toast.error("상점 목록을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  async function handleAdd() {
    if (!newName.trim() || !newBlogId.trim()) {
      toast.error("상점명과 네이버 블로그 ID를 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          blogId: newBlogId.trim(),
        }),
      });
      const json = (await res.json()) as { success: boolean; data: Shop[]; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "상점 추가에 실패했습니다.");
      }

      setShops(json.data);
      setNewName("");
      setNewBlogId("");
      setIsAdding(false);
      toast.success("상점을 추가했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상점 추가에 실패했습니다.");
    }
  }

  async function handleUpdate(shopId: string) {
    if (!editName.trim() || !editBlogId.trim()) {
      toast.error("상점명과 네이버 블로그 ID를 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch(`/api/shops/${shopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          blogId: editBlogId.trim(),
        }),
      });
      const json = (await res.json()) as { success: boolean; data: Shop[]; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "상점 수정에 실패했습니다.");
      }

      setShops(json.data);
      setEditingId(null);
      toast.success("상점 정보를 수정했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상점 수정에 실패했습니다.");
    }
  }

  async function handleDelete(shopId: string, shopName: string) {
    if (!window.confirm(`\"${shopName}\" 상점을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/shops/${shopId}`, { method: "DELETE" });
      const json = (await res.json()) as { success: boolean; data: Shop[]; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "상점 삭제에 실패했습니다.");
      }

      setShops(json.data);
      toast.success("상점을 삭제했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상점 삭제에 실패했습니다.");
    }
  }

  function startEdit(shop: Shop) {
    setEditingId(shop.id);
    setEditName(shop.name);
    setEditBlogId(shop.blogId);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href="/"
            className="text-muted-foreground transition-colors hover:text-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">상점 관리</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">등록된 상점 {shops.length}개</p>
          {!isAdding && (
            <Button size="sm" onClick={() => setIsAdding(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              상점 추가
            </Button>
          )}
        </div>

        {isAdding && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">새 상점 등록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-name">상점명</Label>
                  <Input
                    id="new-name"
                    placeholder="예: 안경원 본점"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-blogid">네이버 블로그 ID</Label>
                  <Input
                    id="new-blogid"
                    placeholder="예: top50jn"
                    value={newBlogId}
                    onChange={(e) => setNewBlogId(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                블로그 ID는 네이버 블로그 URL의 마지막 값입니다. 예: <code>blog.naver.com/top50jn</code>
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName("");
                    setNewBlogId("");
                  }}
                >
                  <X className="mr-1 h-4 w-4" />
                  취소
                </Button>
                <Button size="sm" onClick={handleAdd}>
                  <Save className="mr-1 h-4 w-4" />
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {shops.length === 0 && !isAdding && (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">등록된 상점이 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                상단의 &quot;상점 추가&quot; 버튼으로 첫 상점을 등록해 주세요.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {shops.map((shop) => (
            <Card key={shop.id}>
              <CardContent className="py-4">
                {editingId === shop.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>상점명</Label>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>네이버 블로그 ID</Label>
                        <Input
                          value={editBlogId}
                          onChange={(e) => setEditBlogId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        <X className="mr-1 h-4 w-4" />
                        취소
                      </Button>
                      <Button size="sm" onClick={() => handleUpdate(shop.id)}>
                        <Save className="mr-1 h-4 w-4" />
                        수정
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                        <Store className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{shop.name}</p>
                        <p className="text-xs text-muted-foreground">blog.naver.com/{shop.blogId}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(shop)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                        onClick={() => handleDelete(shop.id, shop.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
