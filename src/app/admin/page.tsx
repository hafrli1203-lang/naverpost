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

type ShopForm = {
  name: string;
  blogId: string;
  address: string;
  naverPlaceUrl: string;
  homepageUrl: string;
  brandBannerText: string;
  parkingInfo: string;
  businessHours: string;
  mainProducts: string;
  serviceStrengths: string;
  visitChecklist: string;
  avoidClaims: string;
};

const EMPTY_FORM: ShopForm = {
  name: "",
  blogId: "",
  address: "",
  naverPlaceUrl: "",
  homepageUrl: "",
  brandBannerText: "",
  parkingInfo: "",
  businessHours: "",
  mainProducts: "",
  serviceStrengths: "",
  visitChecklist: "",
  avoidClaims: "",
};

function listToText(items?: string[]): string {
  return items?.join("\n") ?? "";
}

function shopToForm(shop: Shop): ShopForm {
  return {
    name: shop.name,
    blogId: shop.blogId,
    address: shop.address ?? "",
    naverPlaceUrl: shop.naverPlaceUrl ?? "",
    homepageUrl: shop.homepageUrl ?? "",
    brandBannerText: shop.brandBannerText ?? "",
    parkingInfo: shop.parkingInfo ?? "",
    businessHours: shop.businessHours ?? "",
    mainProducts: listToText(shop.mainProducts),
    serviceStrengths: listToText(shop.serviceStrengths),
    visitChecklist: listToText(shop.visitChecklist),
    avoidClaims: listToText(shop.avoidClaims),
  };
}

function textToList(value: string): string[] | undefined {
  const items = value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function formToPayload(form: ShopForm) {
  return {
    name: form.name.trim(),
    blogId: form.blogId.trim(),
    address: form.address.trim(),
    naverPlaceUrl: form.naverPlaceUrl.trim(),
    homepageUrl: form.homepageUrl.trim(),
    brandBannerText: form.brandBannerText.trim(),
    parkingInfo: form.parkingInfo.trim(),
    businessHours: form.businessHours.trim(),
    mainProducts: textToList(form.mainProducts) ?? [],
    serviceStrengths: textToList(form.serviceStrengths) ?? [],
    visitChecklist: textToList(form.visitChecklist) ?? [],
    avoidClaims: textToList(form.avoidClaims) ?? [],
  };
}

function ShopDetailFields({
  form,
  onChange,
}: {
  form: ShopForm;
  onChange: (key: keyof ShopForm, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>상점명</Label>
          <Input value={form.name} onChange={(e) => onChange("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>네이버 블로그 ID</Label>
          <Input value={form.blogId} onChange={(e) => onChange("blogId", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>매장 주소</Label>
          <Input
            value={form.address}
            onChange={(e) => onChange("address", e.target.value)}
            placeholder="네이버 플레이스와 동일한 주소"
          />
        </div>
        <div className="space-y-1.5">
          <Label>네이버 플레이스 링크</Label>
          <Input
            value={form.naverPlaceUrl}
            onChange={(e) => onChange("naverPlaceUrl", e.target.value)}
            placeholder="https://naver.me/..."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>홈페이지 링크</Label>
          <Input
            value={form.homepageUrl}
            onChange={(e) => onChange("homepageUrl", e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>하단 안내 문구</Label>
          <Input
            value={form.brandBannerText}
            onChange={(e) => onChange("brandBannerText", e.target.value)}
            placeholder="예: 네이버 플레이스에서 위치 확인"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>운영시간</Label>
          <Input
            value={form.businessHours}
            onChange={(e) => onChange("businessHours", e.target.value)}
            placeholder="예: 평일 10:00~20:00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>주차/방문 정보</Label>
          <Input
            value={form.parkingInfo}
            onChange={(e) => onChange("parkingInfo", e.target.value)}
            placeholder="예: 인근 공영주차장 이용"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextareaField
          label="주력 품목/서비스"
          value={form.mainProducts}
          onChange={(value) => onChange("mainProducts", value)}
          placeholder={"누진다초점\n안경렌즈 교체\n안경피팅"}
        />
        <TextareaField
          label="현장 확인/관리 항목"
          value={form.serviceStrengths}
          onChange={(value) => onChange("serviceStrengths", value)}
          placeholder={"도수 확인\n피팅 조정\n기존 안경 상태 확인"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextareaField
          label="방문 전 확인 포인트"
          value={form.visitChecklist}
          onChange={(value) => onChange("visitChecklist", value)}
          placeholder={"현재 쓰는 안경 지참\n불편한 거리 메모\n운전·독서·컴퓨터 중 불편한 상황 확인"}
        />
        <TextareaField
          label="매장별 금지 표현"
          value={form.avoidClaims}
          onChange={(value) => onChange("avoidClaims", value)}
          placeholder={"최고\n완벽\n치료\n진단"}
        />
      </div>
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <p className="text-xs text-muted-foreground">줄바꿈 또는 쉼표로 여러 항목을 입력할 수 있습니다.</p>
    </div>
  );
}

export default function AdminPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<ShopForm>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ShopForm>(EMPTY_FORM);

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
    // Initial admin data load; fetch completion updates the shop list.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadShops();
  }, [loadShops]);

  async function handleAdd() {
    if (!newForm.name.trim() || !newForm.blogId.trim()) {
      toast.error("상점명과 네이버 블로그 ID를 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch("/api/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(newForm)),
      });
      const json = (await res.json()) as { success: boolean; data: Shop[]; error?: string };
      if (!json.success) {
        throw new Error(json.error ?? "상점 추가에 실패했습니다.");
      }

      setShops(json.data);
      setNewForm(EMPTY_FORM);
      setIsAdding(false);
      toast.success("상점을 추가했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "상점 추가에 실패했습니다.");
    }
  }

  async function handleUpdate(shopId: string) {
    if (!editForm.name.trim() || !editForm.blogId.trim()) {
      toast.error("상점명과 네이버 블로그 ID를 입력해 주세요.");
      return;
    }

    try {
      const res = await fetch(`/api/shops/${shopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(editForm)),
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
    setEditForm(shopToForm(shop));
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
          <h1 className="flex-1 text-lg font-bold text-gray-900">상점 관리</h1>
          <Link
            href="/operations"
            className="text-sm text-muted-foreground transition-colors hover:text-gray-700"
          >
            콘텐츠 운영
          </Link>
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
              <ShopDetailFields
                form={newForm}
                onChange={(key, value) => setNewForm((prev) => ({ ...prev, [key]: value }))}
              />
              <p className="text-xs text-muted-foreground">
                블로그 ID는 네이버 블로그 URL의 마지막 값입니다. 예: <code>blog.naver.com/top50jn</code>
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewForm(EMPTY_FORM);
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
                    <ShopDetailFields
                      form={editForm}
                      onChange={(key, value) => setEditForm((prev) => ({ ...prev, [key]: value }))}
                    />
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
