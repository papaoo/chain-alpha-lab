import { SelectionRunDetailLoader } from "@/components/SelectionRunDetailClient";

export default async function SelectionRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SelectionRunDetailLoader id={id} />;
}
