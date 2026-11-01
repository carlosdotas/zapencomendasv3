import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  Image as ImageIcon, 
  Server, 
  Lock, 
  Eye, 
  EyeOff, 
  Wifi, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink, 
  Save, 
  Cloud,
  Layers,
  Sparkles,
  Filter,
  Calendar,
  Trash2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  FileCheck
} from 'lucide-react';
import { 
  getImageServerUrl, 
  setImageServerUrl, 
  getImageServerPassword, 
  setImageServerPassword, 
  testImageServerConnection 
} from '../../../services/api';
import { firebaseSettingsService } from '../../../services/firebaseSettingsService';

interface ImageItem {
  filename: string;
  url: string;
  thumb_url: string;
  size_kb: number;
  width: number;
  height: number;
  created_at: string;
  date_iso?: string;
  timestamp: number;
}

interface ImageServerSettingsPageProps {
  onBack: () => void;
  serverUrl: string;
  serverPassword: string;
  onUpdate: (url: string, pass: string) => void;
}

export const ImageServerSettingsPage: React.FC<ImageServerSettingsPageProps> = ({
  onBack,
  serverUrl: initialUrl,
  serverPassword: initialPass,
  onUpdate
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [password, setPassword] = useState(initialPass);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Estados da Galeria com Paginação, Filtro por Data e Ordenação
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryLimit, setGalleryLimit] = useState(12);
  const [totalImages, setTotalImages] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'name_asc'>('date_desc');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);

  const fetchImages = useCallback(async (
    page: number = galleryPage,
    sort: string = sortBy,
    from: string = dateFrom,
    to: string = dateTo,
    limit: number = galleryLimit
  ) => {
    if (!url || !url.trim()) return;
    setIsLoadingImages(true);
    try {
      const cleanUrl = url.trim();
      const params = new URLSearchParams({
        action: 'list',
        password: password.trim(),
        page: String(page),
        limit: String(limit),
        sort
      });
      if (from) params.append('date_from', from);
      if (to) params.append('date_to', to);

      const res = await fetch(`${cleanUrl}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.images)) {
        setImages(data.images);
        setTotalImages(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setGalleryPage(data.page || 1);
      }
    } catch (e) {
      console.warn('Erro ao carregar lista de imagens:', e);
    } finally {
      setIsLoadingImages(false);
    }
  }, [url, password, galleryPage, sortBy, dateFrom, dateTo, galleryLimit]);

  useEffect(() => {
    if (url) {
      fetchImages(1, sortBy, dateFrom, dateTo);
    }
  }, [url, sortBy, dateFrom, dateTo]);

  const handleDeleteImage = async (filename: string) => {
    if (!window.confirm(`Deseja realmente excluir permanentemente a imagem "${filename}"?`)) return;
    setDeletingFile(filename);
    try {
      const cleanUrl = url.trim();
      const res = await fetch(`${cleanUrl}?action=delete&password=${encodeURIComponent(password.trim())}&f=${encodeURIComponent(filename)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data && data.success) {
        fetchImages(galleryPage, sortBy, dateFrom, dateTo);
      } else {
        alert(data?.message || 'Erro ao excluir imagem.');
      }
    } catch (e: any) {
      alert(`Falha ao conectar com o servidor: ${e?.message}`);
    } finally {
      setDeletingFile(null);
    }
  };

  const handleCopyLink = (imgUrl: string) => {
    navigator.clipboard.writeText(imgUrl).then(() => {
      setCopiedUrl(imgUrl);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testImageServerConnection(url, password);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || 'Falha na requisição ao servidor de imagens' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setImageServerUrl(url);
    setImageServerPassword(password);
    onUpdate(url, password);

    await firebaseSettingsService.saveSettings({
      imageServer: { url, password }
    });

    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="min-h-full pb-20 animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Top App Bar Estilo Android */}
      <div className="sticky top-0 z-20 bg-[#F8F9FA]/95 backdrop-blur-md px-4 sm:px-6 py-3 border-b border-slate-200/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full hover:bg-slate-200/80 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
            title="Voltar para Configurações"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.3]" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              Servidor de Imagens PHP
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold">
              Armazenamento central de fotos e redimensionamento dinâmico
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B5187] hover:bg-[#083e68] active:scale-95 text-white font-bold text-xs rounded-full shadow-md shadow-[#0B5187]/20 transition-all cursor-pointer"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[3]" />
              <span>Salvo na Nuvem!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar no Firebase'}</span>
            </>
          )}
        </button>
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {/* Banner de Sincronização Android */}
        <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-purple-50 border border-purple-200/70 text-purple-950 text-xs">
          <Cloud className="w-4 h-4 text-purple-600 shrink-0 stroke-[2.4]" />
          <span className="font-semibold">
            Ao salvar a URL do servidor PHP, todos os dispositivos (motoristas, clientes e admins) passarão a enviar e carregar fotos por este servidor.
          </span>
        </div>

        {/* Card 1: Configuração do Servidor */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Parâmetros de Conexão do Servidor PHP
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Informe a rota completa para o arquivo <code>images.php</code> no seu servidor Apache/XAMPP ou nuvem
            </p>
          </div>

          <div className="space-y-4">
            {/* Campo URL do Servidor */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                URL do Arquivo PHP (Endpoint de Upload e Download)
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost/imagens/images.php"
                  className="w-full text-xs font-bold bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 focus:outline-none transition-colors"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Exemplo local: <code>http://localhost/imagens/images.php</code> ou na rede: <code>http://192.168.1.100/imagens/images.php</code>
              </span>
            </div>

            {/* Campo Senha do Servidor */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Senha de Acesso do Servidor (Proteção de Upload e Visualização)
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha definida no arquivo PHP"
                  className="w-full text-xs font-black bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#0B5187] rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Essa senha é exigida no painel web do PHP e em todas as requisições autenticadas.
              </span>
            </div>

            {/* Botão de Teste */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !url.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-slate-600 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Testando conexão...' : 'Testar Conexão com Servidor'}</span>
              </button>

              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#0B5187] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Painel Web no Navegador</span>
                </a>
              )}
            </div>

            {/* Resultado do Teste */}
            {testResult && (
              <div className={`p-4 rounded-2xl border text-xs animate-in fade-in duration-150 ${
                testResult.success 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                  : 'bg-red-50 border-red-300 text-red-950'
              }`}>
                <div className="flex items-center gap-2 font-black mb-1">
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      <span>Conexão Realizada com Sucesso!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-600 stroke-[3]" />
                      <span>Falha de Conexão com o Servidor</span>
                    </>
                  )}
                </div>
                <p className="font-semibold text-[11px] leading-relaxed">
                  {testResult.message}
                </p>
                {testResult.details && (
                  <div className="mt-2 pt-2 border-t border-emerald-200 text-[10px] space-y-0.5">
                    <div>Status PHP: {testResult.details.status || 'OK'}</div>
                    {testResult.details.directory && <div>Pasta de Imagens: {testResult.details.directory}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Benefícios e Regras de Redimensionamento */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Recursos Automáticos do Servidor de Imagens
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 font-medium">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                Deduplicação Inteligente:
              </span>
              <p className="text-[11px] text-slate-500">
                Compara o hash SHA-1 do arquivo. Fotos repetidas não criam lixo em disco e retornam o link existente.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="font-bold text-slate-800 block">⚡ Redimensionamento:</span>
              <p className="text-[11px] text-slate-500">
                Fotos são otimizadas na entrada para economia de storage e upload ultra-rápido via 4G.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1">
              <span className="font-bold text-slate-800 block">📶 Economia de Dados:</span>
              <p className="text-[11px] text-slate-500">
                Miniaturas dinâmicas leves para o mapa (<code>?w=200&h=200</code>) e alta resolução sob demanda.
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Galeria de Imagens com Paginação, Filtro por Data e Ordenação */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4.5 h-4.5 text-[#0B5187]" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Galeria de Imagens no Servidor
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px]">
                  {totalImages} {totalImages === 1 ? 'arquivo' : 'arquivos'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Navegação paginada para máxima performance sem travar a tela
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchImages(galleryPage, sortBy, dateFrom, dateTo)}
                disabled={isLoadingImages}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                title="Recarregar galeria"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingImages ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros: Filtro por Data e Ordenação */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center gap-3">
            {/* Filtro Data Inicial */}
            <div className="flex items-center gap-1.5 min-w-[140px]">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 leading-none">De:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setGalleryPage(1);
                  }}
                  className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0B5187]"
                />
              </div>
            </div>

            {/* Filtro Data Final */}
            <div className="flex items-center gap-1.5 min-w-[140px]">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 leading-none">Até:</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setGalleryPage(1);
                  }}
                  className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0B5187]"
                />
              </div>
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-1.5 min-w-[180px] ml-auto">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <div className="flex flex-col w-full">
                <span className="text-[10px] font-bold text-slate-400 leading-none">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    const newSort = e.target.value as any;
                    setSortBy(newSort);
                    setGalleryPage(1);
                  }}
                  className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#0B5187] cursor-pointer"
                >
                  <option value="date_desc">Mais Recentes Primeiro</option>
                  <option value="date_asc">Mais Antigas Primeiro</option>
                  <option value="size_desc">Maior Tamanho (KB)</option>
                  <option value="size_asc">Menor Tamanho (KB)</option>
                  <option value="name_asc">Nome do Arquivo (A-Z)</option>
                </select>
              </div>
            </div>

            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setGalleryPage(1);
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
              >
                Limpar datas
              </button>
            )}
          </div>

          {/* Grade de Imagens */}
          {isLoadingImages ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0B5187]" />
              <span className="text-xs font-semibold">Carregando fotos do servidor...</span>
            </div>
          ) : images.length === 0 ? (
            <div className="py-10 text-center text-slate-400 space-y-1">
              <ImageIcon className="w-8 h-8 mx-auto opacity-40 mb-1" />
              <p className="text-xs font-bold">Nenhuma imagem encontrada no servidor.</p>
              <p className="text-[11px] text-slate-400">
                {dateFrom || dateTo ? 'Tente alterar os filtros de data.' : 'As fotos enviadas pelo app aparecerão aqui.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img) => (
                <div
                  key={img.filename}
                  className="group relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 hover:shadow-md transition-all flex flex-col"
                >
                  {/* Foto Miniatura */}
                  <div
                    onClick={() => setPreviewImage(img)}
                    className="relative aspect-square w-full bg-slate-900 cursor-pointer overflow-hidden"
                  >
                    <img
                      src={img.thumb_url}
                      alt={img.filename}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = img.url;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                    </div>

                    {/* Badge de Tamanho */}
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-white">
                      {img.size_kb} KB
                    </span>
                  </div>

                  {/* Informações & Ações */}
                  <div className="p-2 space-y-1 bg-white">
                    <p className="text-[11px] font-bold text-slate-800 truncate" title={img.filename}>
                      {img.filename}
                    </p>
                    <p className="text-[9px] text-slate-400 font-medium truncate">
                      {img.created_at}
                    </p>

                    <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(img.url)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B5187] hover:underline cursor-pointer"
                        title="Copiar URL completa"
                      >
                        {copiedUrl === img.url ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            <span className="text-emerald-600 font-black">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Link</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.filename)}
                        disabled={deletingFile === img.filename}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Excluir imagem do servidor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Barra de Paginação */}
          {totalPages > 1 && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 font-semibold">
                Página <span className="font-bold text-slate-800">{galleryPage}</span> de{' '}
                <span className="font-bold text-slate-800">{totalPages}</span>
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const prev = Math.max(1, galleryPage - 1);
                    setGalleryPage(prev);
                    fetchImages(prev, sortBy, dateFrom, dateTo);
                  }}
                  disabled={galleryPage <= 1 || isLoadingImages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && galleryPage > 3) {
                      pageNum = galleryPage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => {
                          setGalleryPage(pageNum);
                          fetchImages(pageNum, sortBy, dateFrom, dateTo);
                        }}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                          galleryPage === pageNum
                            ? 'bg-[#0B5187] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(totalPages, galleryPage + 1);
                    setGalleryPage(next);
                    fetchImages(next, sortBy, dateFrom, dateTo);
                  }}
                  disabled={galleryPage >= totalPages || isLoadingImages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Visualização da Imagem em Tela Cheia */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl overflow-hidden max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold truncate max-w-sm">{previewImage.filename}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px]">
              <img
                src={previewImage.url}
                alt={previewImage.filename}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-4 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
              <div className="space-y-0.5">
                <p>Data: <span className="font-bold text-slate-800">{previewImage.created_at}</span></p>
                <p>Tamanho: <span className="font-bold text-slate-800">{previewImage.size_kb} KB</span> {previewImage.width ? `(${previewImage.width}x${previewImage.height}px)` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyLink(previewImage.url)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Link</span>
                </button>
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-[#0B5187] text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Original</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
