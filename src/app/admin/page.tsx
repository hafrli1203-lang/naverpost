"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Pencil, Save, X, Store } from "lucide-react";
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
      const json = await res.json();
      if (json.success) setShops(json.data);
    } catch {
      toast.error("매장 목록을 불러올 수 없습니다.");
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  async function handleAdd() {
    if (!newName.trim() || !newBlogId.trim()) {
      toast.error("매장명과 블로그 ID를 모두 입력해주세요.");
      return;
    }

    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), blogId: newBlogId.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShops(json.data);
      setNewName("");
      setNewBlogId("");
      setIsAdding(false);
      toast.success("매장이 등록되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "매장 등록에 실패했습니다.");
    }
  }

  async function handleUpdate(shopId: string) {
    if (!editName.trim() || !editBlogId.trim()) {
      toast.error("매장명과 블로그 ID를 모두 입력해주세요.");
      return;
    }

    try {
      const res = await fetch(`/api/shops/${shopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), blogId: editBlogId.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShops(json.data);
      setEditingId(null);
      toast.success("매장 정보가 수정되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "매장 수정에 실패했습니다.");
    }
  }

  async function handleDelete(shopId: string, shopName: string) {
    if (!confirm(`"${shopName}"을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/shops/${shopId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setShops(json.data);
      toast.success("매장이 삭제되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "매장 삭제에 실패했습니다.");
    }
  }

  function startEdit(shop: Shop) {
    setEditingId(shop.id);
    setEditName(shop.name);
    setEditBlogId(shop.blogId);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href="/"
            className="text-muted-foreground hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-lg font-bold text-gray-900">안경원 관리</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            등록된 안경원: {shops.length}개
          </p>
          {!isAdding && (
            <Button
              size="sm"
              onClick={() => setIsAdding(true)}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              안경원 추가
            </Button>
          )}
        </div>

        {/* 새 안경원 추가 폼 */}
        {isAdding && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">새 안경원 등록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-name">매장명</Label>
                  <Input
                    id="new-name"
                    placeholder="예: 탑50안경 전남점"
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
                블로그 ID는 네이버 블로그 URL의 마지막 부분입니다. (blog.naver.com/<b>블로그ID</b>)
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName("");
                    setNewBlogId("");
                  }}
                >
                  <X className="w-4 h-4 mr-1" />
                  취소
                </Button>
                <Button size="sm" onClick={handleAdd}>
                  <Save className="w-4 h-4 mr-1" />
                  등록
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 등록된 안경원 목록 */}
        {shops.length === 0 && !isAdding && (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">등록된 안경원이 없습니다.</p>
              <p className="text-sm text-muted-foreground mt-1">
                위의 "안경원 추가" 버튼을 클릭하여 매장을 등록하세요.
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
                        <Label>매장명</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>블로그 ID</Label>
                        <Input
                          value={editBlogId}
                          onChange={(e) => setEditBlogId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="w-4 h-4 mr-1" />
                        취소
                      </Button>
                      <Button size="sm" onClick={() => handleUpdate(shop.id)}>
                        <Save className="w-4 h-4 mr-1" />
                        저장
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
                        <Store className="w-4 h-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{shop.name}</p>
                        <p className="text-xs text-muted-foreground">
                          blog.naver.com/{shop.blogId}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(shop)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(shop.id, shop.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
