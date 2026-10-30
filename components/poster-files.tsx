"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "@/components/locale-provider";

function PosterPreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={image} alt={file.name} style={{width:"100%",aspectRatio:"3/4",objectFit:"contain",background:"#090a0c",borderRadius:10}} />;
}

export default function PosterFiles({ files, onChange, maxFiles = 5, disabled = false }: {
  files: File[]; onChange: (files: File[]) => void; maxFiles?: number; disabled?: boolean;
}) {
  const ru = useLocale() === "ru";
  return <div>
    <input className="field" aria-label={ru ? "Выбрать афиши" : "Афишаларды таңдау"} type="file" accept="image/*" multiple disabled={disabled || files.length >= maxFiles} onChange={event => {
      const selected = Array.from(event.target.files ?? []).filter(file => file.type.startsWith("image/"));
      onChange([...files, ...selected].slice(0, maxFiles));
      event.target.value = "";
    }} />
    {files.length > 0 && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginTop:12}}>
      {files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}>
        <PosterPreview file={file} />
        <button type="button" className="secondary" disabled={disabled} aria-label={`${ru ? "Удалить афишу" : "Афишаны жою"} ${file.name}`} onClick={() => onChange(files.filter((_, i) => i !== index))}>{ru ? "Удалить" : "Жою"}</button>
      </div>)}
    </div>}
  </div>;
}
