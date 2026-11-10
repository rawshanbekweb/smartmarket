import { QRCodeSVG } from 'qrcode.react';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { tx, txServer } from '../lib/i18n';

export interface ReceiptData {
  receiptNumber: string;
  publicToken?: string;
  issuedAt: string;
  content: {
    marketName: string;
    marketAddress?: string | null;
    spaceNumber: string;
    rowName: string;
    amount: number;
    method: string;
    externalRef?: string | null;
    cashierName: string | null;
    paidAt: string;
    validUntil: string | null;
    cycleName: string | null;
    simulated?: boolean;
    demo?: boolean;
    footer?: string;
  };
}


/** Printable thermal-style receipt (80mm). */
export function Receipt({ r, cancelled }: { r: ReceiptData; cancelled?: boolean }) {
  const c = r.content;
  const verifyUrl = r.publicToken ? `${window.location.origin}/qr/receipt/${r.publicToken}` : null;
  const line = (l: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{l}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return (
    <div className="print-area relative mx-auto w-[300px] rounded-lg border border-solid border-slate-200 bg-white p-5 font-mono text-[12px] text-slate-900 shadow-card">
      {(c.demo || c.simulated) && (
        <div className="mb-3 rounded border border-dashed border-amber-400 bg-amber-50 px-2 py-1 text-center text-[10px] font-bold uppercase text-amber-800">
          {c.simulated ? tx("DEMO — simulyatsiya qilingan elektron to'lov") : tx("DEMO — namoyish cheki, haqiqiy emas")}
        </div>
      )}
      {cancelled && (
        <div className="mb-3 rounded bg-red-600 px-2 py-1 text-center text-[11px] font-bold uppercase text-white">{tx("Bekor qilingan")}</div>
      )}
      <div className="text-center">
        <div className="text-[14px] font-bold">{c.marketName}</div>
        {c.marketAddress && <div className="text-[10px] text-slate-500">{c.marketAddress}</div>}
        <div className="mt-2 text-[11px] uppercase tracking-widest text-slate-500">{tx("To'lov cheki")}</div>
        <div className="text-[13px] font-bold">{r.receiptNumber}</div>
      </div>
      <div className="my-3 border-0 border-t border-dashed border-slate-300" />
      {line(tx("Sana"), fmtDateTime(c.paidAt))}
      {line(tx("Joy"), `${c.spaceNumber} (${c.rowName})`)}
      {line(tx("To'lov usuli"), c.method === 'CASH' ? tx("Naqd") : c.method.charAt(0) + c.method.slice(1).toLowerCase())}
      {c.externalRef && line(tx("Click chek №"), c.externalRef)}
      {c.cashierName && line(tx("Qabul qildi"), c.cashierName)}
      {c.cycleName && line(tx("Sikl"), c.cycleName)}
      {c.validUntil && line(tx("Amal qiladi"), fmtDateTime(c.validUntil))}
      <div className="my-3 border-0 border-t border-dashed border-slate-300" />
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-bold">{tx("JAMI")}</span>
        <span className="text-[16px] font-bold">{fmtMoney(c.amount)}</span>
      </div>
      {verifyUrl && (
        <div className="mt-4 flex flex-col items-center gap-1">
          <QRCodeSVG value={verifyUrl} size={92} level="M" />
          <span className="text-[9px] text-slate-500">{tx("Chekni tekshirish uchun skanerlang")}</span>
        </div>
      )}
      {c.footer && <div className="mt-3 text-center text-[10px] text-slate-500">{txServer(c.footer)}</div>}
    </div>
  );
}
