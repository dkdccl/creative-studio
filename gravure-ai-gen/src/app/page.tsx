import ImageGenerator from "@/components/ImageGenerator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">gravure-ai-gen</h1>
        <p className="mt-1 text-sm opacity-60">
          Text-to-image generation via the Prodia inference API.
        </p>
      </header>
      <ImageGenerator />
    </main>
  );
}
