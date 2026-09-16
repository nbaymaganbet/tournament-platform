"use client";

import { useEffect, useState } from "react";

const slides = {
  ru: [
    { kicker: "TOURNAMENT PLATFORM", title: "Соревнования — в одном месте", text: "Создавайте турниры, принимайте заявки и управляйте участниками без лишней ручной работы.", mark: "01" },
    { kicker: "ПОДГОТОВКА", title: "От заявки до сетки", text: "Подтвердите участников, распределите их по категориям, проведите взвешивание и сформируйте сетку.", mark: "02" },
    { kicker: "ПРОВЕДЕНИЕ", title: "Понятно организатору и участнику", text: "Расписание, сетки и результаты собраны в одной платформе. Начните с создания своего первого турнира.", mark: "03" },
  ],
  kk: [
    { kicker: "TOURNAMENT PLATFORM", title: "Жарыстар — бір жерде", text: "Турнирлерді жасаңыз, өтінімдерді қабылдаңыз және қатысушыларды артық қол жұмысынсыз басқарыңыз.", mark: "01" },
    { kicker: "ДАЙЫНДЫҚ", title: "Өтінімнен торға дейін", text: "Қатысушыларды растаңыз, санаттарға бөліңіз, өлшеуден өткізіп, жарыс торын қалыптастырыңыз.", mark: "02" },
    { kicker: "ӨТКІЗУ", title: "Ұйымдастырушыға да, қатысушыға да түсінікті", text: "Кесте, тор және нәтижелер бір платформада. Алғашқы турниріңізді жасаудан бастаңыз.", mark: "03" },
  ],
};

export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<"ru" | "kk">("ru");

  useEffect(() => {
    const savedLang = localStorage.getItem("tp-lang");
    const nextLang = savedLang === "kk" ? "kk" : "ru";
    setLang(nextLang);
    if (localStorage.getItem("tp-onboarding-seen") !== "1") setOpen(true);
    const handler = () => { setStep(0); setOpen(true); };
    window.addEventListener("tp-open-onboarding", handler);
    return () => window.removeEventListener("tp-open-onboarding", handler);
  }, []);

  if (!open) return null;
  const content = slides[lang][step];
  const last = step === slides[lang].length - 1;

  function finish() {
    localStorage.setItem("tp-onboarding-seen", "1");
    setOpen(false);
  }

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Tournament Platform">
      <div className="onboarding-panel">
        <div className="onboarding-grid" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <button className="onboarding-skip" type="button" onClick={finish}>{lang === "ru" ? "Пропустить" : "Өткізу"}</button>
        <div className="onboarding-brand">{lang === "ru" ? "TOURNAMENT PLATFORM" : "TOURNAMENT PLATFORM"}</div>
        <div className="onboarding-mark">{content.mark}</div>
        <div className="onboarding-content">
          <div className="onboarding-kicker">{content.kicker}</div>
          <h1>{content.title}</h1>
          <p>{content.text}</p>
        </div>
        <div className="onboarding-bottom">
          <div className="onboarding-dots" aria-label={`${step + 1} / ${slides[lang].length}`}>
            {slides[lang].map((_, i) => <button key={i} type="button" aria-label={`${i + 1}`} className={i === step ? "active" : ""} onClick={() => setStep(i)} />)}
          </div>
          <button className="onboarding-next" type="button" onClick={() => last ? finish() : setStep(step + 1)}>
            {last ? (lang === "ru" ? "Начать" : "Бастау") : (lang === "ru" ? "Далее" : "Келесі")} <span>→</span>
          </button>
        </div>
      </div>
      <style jsx>{`
        .onboarding-overlay{position:fixed;inset:0;z-index:1000;background:#08090b;display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit}
        .onboarding-panel{position:relative;width:min(100%,720px);min-height:min(720px,calc(100dvh - 36px));overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:linear-gradient(145deg,#17191d 0%,#0d0e11 58%,#090a0c 100%);box-shadow:0 30px 100px rgba(0,0,0,.65);display:flex;flex-direction:column;padding:28px 30px 24px}
        .onboarding-panel:before{content:"";position:absolute;width:420px;height:420px;border-radius:50%;right:-180px;bottom:-190px;background:rgba(225,6,0,.18);filter:blur(2px)}
        .onboarding-grid{position:absolute;inset:0;opacity:.08;background-image:linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 78%)}
        .onboarding-grid span{position:absolute;width:7px;height:7px;background:#e10600;box-shadow:0 0 18px #e10600}
        .onboarding-grid span:nth-child(1){top:18%;left:14%}.onboarding-grid span:nth-child(2){top:35%;right:18%}.onboarding-grid span:nth-child(3){bottom:24%;left:26%}.onboarding-grid span:nth-child(4){bottom:16%;right:31%}
        .onboarding-skip{position:relative;z-index:2;align-self:flex-end;border:0;background:transparent;color:rgba(255,255,255,.55);font-size:12px;font-weight:800;padding:6px 0;cursor:pointer}
        .onboarding-brand{position:relative;z-index:2;margin-top:30px;color:#fff;font-size:11px;font-weight:900;letter-spacing:.18em}
        .onboarding-mark{position:relative;z-index:2;margin-top:auto;color:#e10600;font-size:clamp(72px,16vw,138px);font-weight:950;line-height:.8;letter-spacing:-.08em}
        .onboarding-content{position:relative;z-index:2;max-width:620px;margin-top:34px}.onboarding-kicker{color:#e10600;font-size:11px;font-weight:900;letter-spacing:.16em;margin-bottom:12px}.onboarding-content h1{margin:0;color:#fff;font-size:clamp(32px,6vw,58px);line-height:.98;letter-spacing:-.04em;max-width:620px}.onboarding-content p{margin:18px 0 0;color:rgba(255,255,255,.68);font-size:16px;line-height:1.55;max-width:560px}
        .onboarding-bottom{position:relative;z-index:2;margin-top:38px;display:flex;align-items:center;justify-content:space-between;gap:18px}.onboarding-dots{display:flex;gap:7px}.onboarding-dots button{width:24px;height:4px;border:0;border-radius:99px;background:rgba(255,255,255,.2);padding:0;cursor:pointer}.onboarding-dots button.active{background:#e10600}.onboarding-next{border:0;border-radius:10px;background:#e10600;color:#fff;padding:13px 18px;font-weight:900;min-width:118px;cursor:pointer;box-shadow:0 8px 26px rgba(225,6,0,.24)}.onboarding-next span{margin-left:8px}
        @media(max-width:560px){.onboarding-overlay{padding:0}.onboarding-panel{min-height:100dvh;width:100%;border:0;border-radius:0;padding:22px 20px 20px}.onboarding-brand{margin-top:26px}.onboarding-mark{margin-top:auto}.onboarding-content h1{font-size:36px}.onboarding-content p{font-size:15px}.onboarding-bottom{margin-top:30px}.onboarding-next{min-width:108px}}
      `}</style>
    </div>
  );
}
