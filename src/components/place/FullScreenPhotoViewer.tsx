import React, { useEffect, useState } from 'react';
import { useMapStore } from '../../context/MapContext';
import { 
  X, 
  Share2, 
  MessageCircle, 
  Download, 
  CheckCircle2, 
  Copy, 
  Check, 
  Phone, 
  FileText,
  User,
  ArrowRight
} from 'lucide-react';
import { formatPhotoUrl } from '../../services/apiAdapters';

const OPERATION_CONFIG = {
  coleta: { label: 'Coleta', bg: 'bg-[#0B5187]' },
  entrega: { label: 'Entrega', bg: 'bg-[#FF5E00]' },
  troca: { label: 'Troca', bg: 'bg-[#7C3AED]' }
};

export const FullScreenPhotoViewer: React.FC = () => {
  const { 
    viewingPhotoUrl, 
    viewingPhotoPlace, 
    selectedPlace, 
    closePhotoViewer 
  } = useMapStore();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    setPhotoError(false);
  }, [viewingPhotoUrl]);

  if (!viewingPhotoUrl) return null;

  const largeUrl = formatPhotoUrl(viewingPhotoUrl, 'lg') || viewingPhotoUrl.replace(/_(icon|thumb|md)\.jpg$/i, '_lg.jpg');
  const mdUrl = formatPhotoUrl(viewingPhotoUrl, 'md') || viewingPhotoUrl;

  const currentPlace = viewingPhotoPlace || selectedPlace;
  const opType = currentPlace?.operationType || 'entrega';
  const opConfig = OPERATION_CONFIG[opType] || OPERATION_CONFIG.entrega;

  const customerName = currentPlace?.customerName || '';
  const customerPhone = currentPlace?.customerPhone || '';
  const responsibleName = currentPlace?.responsibleName || currentPlace?.sellerName || currentPlace?.managerName || '';
  const responsiblePhone = currentPlace?.responsiblePhone || currentPlace?.sellerPhone || currentPlace?.managerPhone || '';

  const primaryPhone = customerPhone || responsiblePhone || currentPlace?.phone || '';
  const observations = (currentPlace?.observations || currentPlace?.driverNotes || currentPlace?.description || '').trim();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const cleanPhoneNumber = (phone: string): string => {
    let clean = phone.replace(/\D/g, '');
    if (!clean) return '';
    if (!clean.startsWith('55') && (clean.length === 10 || clean.length === 11)) {
      clean = `55${clean}`;
    }
    return clean;
  };

  // Botão para ligar diretamente para a pessoa
  const handleCall = (phoneToCall?: string) => {
    const raw = phoneToCall || primaryPhone;
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      showToast('Nenhum número de telefone informado');
      return;
    }
    window.location.href = `tel:${clean}`;
  };

  // WhatsApp estritamente com mensagem em branco conforme instrução
  const handleWhatsApp = (phoneToMessage?: string) => {
    const raw = phoneToMessage || primaryPhone;
    const clean = cleanPhoneNumber(raw);
    if (!clean) {
      showToast('Nenhum telefone de WhatsApp informado');
      return;
    }
    if (typeof window !== 'undefined' && window.AndroidApp?.openWhatsApp) {
      window.AndroidApp.openWhatsApp(clean, '');
    } else {
      window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShare = async () => {
    if (!viewingPhotoUrl) return;
    const title = currentPlace ? `Foto da Encomenda - ${currentPlace.name}` : 'Foto da Encomenda - EncomendasZap';
    const text = currentPlace 
      ? `📦 Foto da Encomenda EncomendasZap\n📍 Local: ${currentPlace.name}\n🏠 Endereço: ${currentPlace.address}\nOperação: ${opConfig.label.toUpperCase()}`
      : '📦 Foto da Encomenda - EncomendasZap';

    if (navigator.share) {
      try {
        if (largeUrl.startsWith('data:image')) {
          try {
            const res = await fetch(largeUrl);
            const blob = await res.blob();
            const file = new File([blob], `encomenda-${currentPlace?.id || 'foto'}.jpg`, { type: blob.type || 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ title, text, files: [file] });
              showToast('Foto compartilhada com sucesso!');
              return;
            }
          } catch {}
        }

        await navigator.share({
          title,
          text,
          url: largeUrl.startsWith('http') ? largeUrl : undefined
        });
        showToast('Compartilhado com sucesso!');
        return;
      } catch (err) {
        // Usuário cancelou
      }
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${largeUrl.startsWith('http') ? largeUrl : ''}`);
        showToast('Link da foto copiado!');
      }
    } catch {}
  };

  const handleDownload = () => {
    if (!largeUrl) return;
    const a = document.createElement('a');
    a.href = largeUrl;
    a.download = `foto-encomenda-${currentPlace?.orderCode || currentPlace?.id || 'zap'}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download iniciado!');
  };

  const handleCopy = async () => {
    if (!largeUrl) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(largeUrl);
        setCopied(true);
        showToast('Link da foto copiado!');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div 
      onClick={closePhotoViewer}
      className="fixed inset-0 z-[250] bg-black/95 flex flex-col justify-between p-3 sm:p-5 animate-in fade-in duration-200 backdrop-blur-md select-none overflow-y-auto"
    >
      {/* Toast flutuante */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] bg-emerald-600 text-white text-xs sm:text-sm font-black px-4 py-2 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. BARRA SUPERIOR: IDENTIFICAÇÃO + AÇÕES RÁPIDAS + BOTÃO FECHAR */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="w-full max-w-4xl mx-auto flex items-center justify-between gap-3 text-white py-2 shrink-0 border-b border-white/10"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-xs shrink-0 ${
            opType === 'coleta' ? 'bg-[#0B5187]' : opType === 'entrega' ? 'bg-[#FF5E00]' : 'bg-[#7C3AED]'
          }`}>
            {opConfig.label}
          </span>
          <div className="min-w-0">
            <h4 className="text-sm sm:text-base font-black truncate">{currentPlace?.name || 'Foto da Encomenda'}</h4>
            {currentPlace?.address && (
              <p className="text-xs text-white/70 truncate">{currentPlace.address}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={closePhotoViewer}
            className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer border border-white/20"
            title="Ver card de detalhes e registrar"
          >
            <span>Ver Detalhes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={closePhotoViewer}
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
            title="Fechar foto grande"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 2. ÁREA CENTRAL: A FOTO GRANDE NA TELA COM AS OBSERVAÇÕES E CONTATOS */}
      <div 
        className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 my-auto min-h-0"
        onClick={closePhotoViewer}
      >
        <div className="relative max-w-full max-h-[62vh] sm:max-h-[68vh] flex items-center justify-center">
          {photoError ? (
            <p role="alert" className="rounded-xl bg-slate-800 px-4 py-3 text-sm text-white">Não foi possível carregar a foto da encomenda.</p>
          ) : (
            <img
              src={largeUrl}
              alt="Foto ampliada da encomenda"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                if (mdUrl !== largeUrl && e.currentTarget.getAttribute('src') !== mdUrl) {
                  e.currentTarget.src = mdUrl;
                } else {
                  setPhotoError(true);
                }
              }}
              className="max-w-full max-h-[62vh] sm:max-h-[68vh] object-contain rounded-2xl shadow-2xl border border-white/15"
            />
          )}
        </div>

        {/* OBSERVAÇÕES DO BANCO DE DADOS NA TELA DA FOTO */}
        {observations && (
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="w-full max-w-xl mx-auto mt-3 bg-amber-500/20 backdrop-blur-md border border-amber-400/40 rounded-2xl p-3 text-amber-100 shadow-xl animate-in fade-in duration-150"
          >
            <div className="flex items-center gap-1.5 mb-1 text-amber-300 font-black text-xs uppercase tracking-wider">
              <FileText className="w-4 h-4 stroke-[2.5] text-amber-400" />
              <span>Observações da Encomenda</span>
            </div>
            <p className="text-xs sm:text-sm text-white font-medium whitespace-pre-line leading-relaxed pl-5">
              {observations}
            </p>
          </div>
        )}
      </div>

      {/* 3. BARRA INFERIOR DE AÇÕES: LIGAR + WHATSAPP (MENSAGEM EM BRANCO) + COMPARTILHAR + BAIXAR */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl mx-auto bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl p-2.5 flex flex-col gap-2 shrink-0 shadow-2xl"
      >
        {/* Linha 1: BOTÃO PARA LIGAR E BOTÃO DO WHATSAPP (COM MENSAGEM EM BRANCO) */}
        <div className="grid grid-cols-2 gap-2">
          {/* Botão de Ligar */}
          <button
            type="button"
            onClick={() => handleCall()}
            className="py-2.5 px-3 rounded-xl bg-[#0B5187] hover:bg-[#083D66] active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-900/30"
            title={primaryPhone ? `Ligar para ${customerName || responsibleName || primaryPhone}` : 'Ligar para a pessoa'}
          >
            <Phone className="w-4 h-4 stroke-[2.5]" />
            <span className="truncate">
              Ligar {customerName ? `(${customerName.split(' ')[0]})` : ''}
            </span>
          </button>

          {/* Botão do WhatsApp (Estritamente com Mensagem em Branco) */}
          <button
            type="button"
            onClick={() => handleWhatsApp()}
            className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/30"
            title="Abrir WhatsApp com conversa em branco"
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span className="truncate">
              WhatsApp {customerName ? `(${customerName.split(' ')[0]})` : ''}
            </span>
          </button>
        </div>

        {/* Linha 2 (Se houver responsável separado do cliente): Atalho para o responsável */}
        {responsiblePhone && responsiblePhone !== customerPhone && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
            <span className="text-[11px] text-white/80 font-bold truncate">
              Responsável: <strong className="text-white">{responsibleName || 'Responsável'}</strong>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCall(responsiblePhone)}
                className="px-2.5 py-1 rounded-lg bg-[#FF5E00] hover:bg-orange-600 text-white font-black text-[11px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                title={`Ligar para o responsável ${responsibleName}`}
              >
                <Phone className="w-3 h-3 stroke-[2.5]" />
                <span>Ligar</span>
              </button>
              <button
                type="button"
                onClick={() => handleWhatsApp(responsiblePhone)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                title={`WhatsApp do responsável ${responsibleName}`}
              >
                <MessageCircle className="w-3 h-3 fill-current" />
                <span>Zap</span>
              </button>
            </div>
          </div>
        )}

        {/* Linha 3: Compartilhar, Baixar e Copiar Foto */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleShare}
            className="flex-1 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/15"
            title="Compartilhar foto"
          >
            <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Compartilhar</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-white/15"
            title="Baixar foto no celular"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Baixar</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border border-white/15"
            title="Copiar link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
