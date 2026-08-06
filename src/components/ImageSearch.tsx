import React, { useState, useEffect } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { safeJsonParse } from "../utils";

interface ImageSearchProps {
  word: string | null;
  imageUrlValue: string | null;
  handleSelectImage: (url: string | null) => void;
  handleClipboardPaste: (e: React.ClipboardEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ImageSearch({
  word,
  imageUrlValue,
  handleSelectImage,
  handleClipboardPaste,
  handleFileChange,
}: ImageSearchProps) {
  const { t } = useTranslation();
  const [imageSearchKeyword, setImageSearchKeyword] = useState(word || "");
  const [imagesList, setImagesList] = useState<{ id: string; url: string; thumb: string; author: string; description: string }[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imageSearchError, setImageSearchError] = useState<string | null>(null);

  const handleSearchImages = async (keyword: string) => {
    if (!keyword || !keyword.trim()) return;
    setImagesLoading(true);
    setImageSearchError(null);
    try {
      const resp = await fetch(`/api/image-search?q=${encodeURIComponent(keyword.trim())}`);
      if (!resp.ok) {
        throw new Error("Failed to fetch images from search proxy.");
      }
      const data = await safeJsonParse(resp);
      setImagesList(data.results || []);
    } catch (err: any) {
      console.error(err);
      setImageSearchError("Failed to fetch images from internet");
    } finally {
      setImagesLoading(false);
    }
  };

  useEffect(() => {
    const query = (word || "").trim();
    setImageSearchKeyword(query);
    if (query) {
      handleSearchImages(query);
    } else {
      setImagesList([]);
    }
  }, [word]);

  return (
    <div className="p-2.5 bg-zinc-50/75 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5 animate-in slide-in-from-top-1 duration-150 font-sans">
      <span className="text-[9px] uppercase font-extrabold text-zinc-400 dark:text-zinc-500 tracking-wider flex items-center gap-1.5 pl-0.5">
        <span className="text-teal-600">🖼️</span> {t('explainer.word_image', 'Word Image')}
      </span>

      {/* Selected Image Preview with delete handle */}
      {imageUrlValue ? (
        <div className="relative group/img rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100/20 dark:bg-zinc-900 max-h-32 flex items-center justify-center">
          <img
            src={imageUrlValue.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(imageUrlValue)}` : imageUrlValue}
            alt={word || ""}
            className="max-h-32 max-w-full object-contain rounded-xl p-1"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity gap-2">
            <button
              type="button"
              onClick={() => handleSelectImage(null)}
              className="px-2.5 py-1 bg-red-650 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 cursor-pointer shadow-sm transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> {t('explainer.remove_image', 'Remove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-normal border border-dashed border-zinc-200 dark:border-zinc-800 p-2 text-center rounded-lg font-medium bg-white dark:bg-zinc-900/40">
          {t('explainer.no_image_selected', 'No image selected. Choose below or paste an image.')}
        </div>
      )}

      {/* Paste from clipboard and custom upload action zone */}
      <div className="grid grid-cols-2 gap-2 font-sans text-[10px]">
        <div
          onPaste={handleClipboardPaste}
          tabIndex={0}
          className="p-1 px-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-center text-zinc-500 cursor-pointer hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-800 dark:hover:text-teal-400 transition-all font-medium flex flex-col justify-center items-center h-12 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
          title="Click here, then press Ctrl+V (or Command+V) to paste any copied image from your clipboard!"
        >
          <span className="font-extrabold uppercase text-[7.5px] text-zinc-400">Paste clipboard</span>
          <span className="text-[9.5px] mt-0.5 font-bold">{t('explainer.paste_image', 'Click & Paste Ctrl+V')}</span>
        </div>

        <label className="p-1 px-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg text-center text-zinc-500 cursor-pointer hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-800 dark:hover:text-teal-400 transition-all font-medium flex flex-col justify-center items-center h-12">
          <span className="font-extrabold uppercase text-[7.5px] text-zinc-400">File upload</span>
          <span className="text-[9.5px] mt-0.5 font-bold">{t('explainer.upload_image', 'Upload file')}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {/* Keyword Search Row */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={imageSearchKeyword}
          onChange={(e) => setImageSearchKeyword(e.target.value)}
          placeholder="Keyword to search..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearchImages(imageSearchKeyword);
            }
          }}
          className="flex-1 px-2.5 py-1 text-[11px] bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-medium"
        />
        <button
          type="button"
          onClick={() => handleSearchImages(imageSearchKeyword)}
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-md text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
        >
          {t('explainer.search_btn', 'Search')}
        </button>
      </div>

      {/* Searched Results Horizontal Grid */}
      <div className="space-y-1 w-full">
        <span className="text-[8.5px] uppercase font-extrabold tracking-widest text-zinc-400 dark:text-zinc-500">{t('explainer.unsplash_results', 'Unsplash Search Results:')}</span>
        
        {imagesLoading ? (
          <div className="py-4 flex items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500 font-bold text-[10px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
            <span>{t('explainer.searching_images', 'Searching images...')}</span>
          </div>
        ) : imageSearchError ? (
          <div className="text-[10px] text-rose-500 py-1 font-bold text-center">
            {imageSearchError}
          </div>
        ) : imagesList.length > 0 ? (
          <div className="grid grid-cols-4 gap-1 max-h-[140px] overflow-y-auto scrollbar-thin rounded-lg p-0.5">
            {imagesList.map((img, idx) => {
              const imgUrl = img.url || (img as any).image || "";
              const rawThumb = img.thumb || (img as any).thumbnail || imgUrl;
              const imgThumb = rawThumb.startsWith("http") ? `/api/image-proxy?url=${encodeURIComponent(rawThumb)}` : rawThumb;
              const imgAuthor = img.author || (img as any).source || "";
              const imgDesc = img.description || (img as any).title || "";
              const imgId = img.id || imgUrl || `img_${idx}`;
              const isSelected = imageUrlValue === imgUrl;
              return (
                <button
                  key={imgId}
                  type="button"
                  onClick={() => handleSelectImage(imgUrl)}
                  title={`${imgDesc} by ${imgAuthor}`}
                  className={`relative aspect-square w-full rounded-md overflow-hidden border transition-all cursor-pointer hover:scale-103 group ${
                    isSelected
                      ? "ring-2 ring-teal-500 border-transparent shadow-xs"
                      : "border-zinc-100 hover:border-zinc-400/80"
                  }`}
                >
                  <img
                    src={imgThumb}
                    alt={imgDesc}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[6.5px] px-0.5 py-0.25 truncate opacity-0 group-hover:opacity-100 transition-opacity leading-none">
                    {imgAuthor}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 text-center py-2 font-medium">
            {t('explainer.no_images_found', 'No images found. Try another query.')}
          </div>
        )}
      </div>
    </div>
  );
}
