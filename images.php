<?php
/**
 * ============================================================================
 * SERVIDOR DE IMAGENS ENCOMENDASZAP (PHP 7.4+ / PHP 8.x)
 * ----------------------------------------------------------------------------
 * Recursos:
 * 1. Upload seguro (Multipart, Base64 JSON ou Form-Data)
 * 2. Redimensionamento inicial automático (otimiza tamanho e qualidade ao entrar)
 * 3. Redimensionamento dinâmico sob demanda (?f=nome.jpg&w=300&h=300&fit=crop)
 * 4. Cache local de miniaturas geradas para máxima velocidade e economia de tráfego
 * 5. Painel administrativo web moderno protegido por senha de acesso
 * 6. Headers CORS completos para integração com o app React/PWA
 * ============================================================================
 */

// Inicia sessão para autenticação no painel web
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// ============================================================================
// CONFIGURAÇÕES GERAIS DO SERVIDOR DE IMAGENS
// ============================================================================
$CONFIG = [
    // Senha padrão de acesso ao painel e upload via API (Altere conforme desejar)
    'password'              => '821332',

    // Diretório onde os arquivos originais serão armazenados
    'upload_dir'            => __DIR__ . '/uploads/images/',

    // Diretório onde miniaturas/tamanhos dinâmicos cacheados serão salvos
    'cache_dir'             => __DIR__ . '/uploads/cache/',

    // Redimensionamento automático ao entrar (evita fotos brutas de 10MB+)
    'max_initial_width'     => 1600,
    'max_initial_height'    => 1600,
    'initial_jpeg_quality'  => 84, // Compressão otimizada

    // Limites de upload
    'max_file_size_bytes'   => 25 * 1024 * 1024, // 25 MB máximo
    'allowed_extensions'    => ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    'allowed_mime_types'    => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],

    // Cache no navegador para imagens servidas (1 ano)
    'browser_cache_seconds' => 31536000,
];

// Garante que as pastas de upload e cache existam
if (!is_dir($CONFIG['upload_dir'])) {
    @mkdir($CONFIG['upload_dir'], 0775, true);
}
if (!is_dir($CONFIG['cache_dir'])) {
    @mkdir($CONFIG['cache_dir'], 0775, true);
}

// Determina a URL base absoluta do script
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ? 'https://' : 'http://';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '/images.php';
$SERVER_URL = rtrim($protocol . $host . $scriptName, '/');

// ============================================================================
// CORS HEADERS (Permite requisições vindas do App React, PWA e Mobile)
// ============================================================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Access-Password, X-Requested-With');
header('Access-Control-Expose-Headers: Content-Length, Content-Type, X-Image-Width, X-Image-Height');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ============================================================================
// HELPERS DE SEGURANÇA E AUTENTICAÇÃO
// ============================================================================
function isAuthenticated($config): bool {
    // 1. Sessão ativa no navegador
    if (!empty($_SESSION['zap_image_auth']) && $_SESSION['zap_image_auth'] === true) {
        return true;
    }
    // 2. Header HTTP de autenticação (API)
    $authHeader = $_SERVER['HTTP_X_ACCESS_PASSWORD'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!empty($authHeader)) {
        $clean = trim(str_ireplace('Bearer', '', $authHeader));
        if ($clean === $config['password']) {
            return true;
        }
    }
    // 3. Parâmetro na query string ou POST
    $passParam = $_REQUEST['password'] ?? $_REQUEST['key'] ?? '';
    if (!empty($passParam) && $passParam === $config['password']) {
        return true;
    }
    return false;
}

// ============================================================================
// ROTAS DE API (TESTE, SERVIR IMAGEM, UPLOAD, DELEÇÃO E LISTAGEM)
// ============================================================================

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$filenameParam = $_GET['f'] ?? $_GET['file'] ?? $_GET['img'] ?? '';

// 1. PING / TEST CONNECTION
if ($action === 'ping' || $action === 'test') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'      => true,
        'message'      => 'Servidor de Imagens PHP EncomendasZap Online!',
        'server_url'   => $SERVER_URL,
        'php_version'  => PHP_VERSION,
        'gd_installed' => extension_loaded('gd'),
        'webp_support' => function_exists('imagewebp'),
        'max_upload'   => ini_get('upload_max_filesize'),
        'timestamp'    => time(),
    ]);
    exit;
}

// 2. SERVIR IMAGEM COM REDIMENSIONAMENTO DINÂMICO (?f=foto.jpg&w=300&h=300&fit=crop)
if (!empty($filenameParam)) {
    serveResizedImage($filenameParam, $CONFIG);
    exit;
}

// 3. UPLOAD DE IMAGEM VIA API OU FORM (POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($action === 'upload' || !empty($_FILES['image']) || !empty($_POST['image']))) {
    handleUpload($CONFIG, $SERVER_URL);
    exit;
}

// 4. DELEÇÃO DE IMAGEM
if ($action === 'delete') {
    handleDelete($CONFIG);
    exit;
}

// 5. LISTA DE IMAGENS EM JSON
if ($action === 'list') {
    if (!isAuthenticated($CONFIG)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Senha de acesso requerida.']);
        exit;
    }
    handleListImages($CONFIG, $SERVER_URL);
    exit;
}

// 6. LOGOUT DO PAINEL WEB
if ($action === 'logout') {
    $_SESSION['zap_image_auth'] = false;
    session_destroy();
    header("Location: $scriptName");
    exit;
}

// 7. LOGIN NO PAINEL WEB
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login_password'])) {
    if ($_POST['login_password'] === $CONFIG['password']) {
        $_SESSION['zap_image_auth'] = true;
        header("Location: $scriptName");
        exit;
    } else {
        $loginError = 'Senha incorreta! Tente novamente.';
    }
}

// Se não autenticado no navegador, exibe a tela de login
if (!isAuthenticated($CONFIG)) {
    renderLoginPage($loginError ?? null, $SERVER_URL);
    exit;
}

// Se autenticado, renderiza o Painel Administrativo Completo
renderAdminDashboard($CONFIG, $SERVER_URL);
exit;

// ============================================================================
// FUNÇÕES DO CORE: REDIMENSIONAMENTO E SERVIÇO DE IMAGENS
// ============================================================================

/**
 * Serve a imagem redimensionada sob demanda com cache em disco e headers HTTP
 */
function serveResizedImage($filename, $config) {
    // Sanitização de nome de arquivo contra Directory Traversal
    $filename = basename(trim($filename));
    $originalPath = $config['upload_dir'] . $filename;

    if (!file_exists($originalPath) || !is_file($originalPath)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Imagem não encontrada: $filename";
        exit;
    }

    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $reqW = isset($_GET['w']) ? (int)$_GET['w'] : (isset($_GET['width']) ? (int)$_GET['width'] : 0);
    $reqH = isset($_GET['h']) ? (int)$_GET['h'] : (isset($_GET['height']) ? (int)$_GET['height'] : 0);
    $fit = isset($_GET['fit']) ? strtolower(trim($_GET['fit'])) : 'contain'; // 'crop' ou 'contain'
    $quality = isset($_GET['q']) ? max(10, min(100, (int)$_GET['q'])) : 82;

    // Se tamanho específico por alias (size=icon|thumb|md|lg)
    $sizeAlias = $_GET['size'] ?? '';
    if ($sizeAlias === 'icon') { $reqW = 64; $reqH = 64; $fit = 'crop'; }
    elseif ($sizeAlias === 'thumb') { $reqW = 200; $reqH = 200; $fit = 'crop'; }
    elseif ($sizeAlias === 'md') { $reqW = 500; $reqH = 500; $fit = 'contain'; }
    elseif ($sizeAlias === 'lg') { $reqW = 1200; $reqH = 1200; $fit = 'contain'; }

    // Se não pediu largura nem altura, serve a imagem original com cache
    if ($reqW <= 0 && $reqH <= 0) {
        streamFileWithCacheHeaders($originalPath, $ext, $config['browser_cache_seconds']);
        exit;
    }

    // Limites de segurança para tamanho solicitado
    $reqW = max(0, min(3000, $reqW));
    $reqH = max(0, min(3000, $reqH));

    // Nome único do arquivo no cache
    $cacheFilename = "resize_{$reqW}x{$reqH}_{$fit}_q{$quality}_" . $filename;
    $cachePath = $config['cache_dir'] . $cacheFilename;

    // Se a miniatura já existe no cache e é mais nova que o original, entrega direto
    if (file_exists($cachePath) && filemtime($cachePath) >= filemtime($originalPath)) {
        streamFileWithCacheHeaders($cachePath, $ext, $config['browser_cache_seconds']);
        exit;
    }

    // Gera a miniatura redimensionada usando a biblioteca GD
    if (!extension_loaded('gd')) {
        // Fallback: se GD não estiver disponível, serve original
        streamFileWithCacheHeaders($originalPath, $ext, $config['browser_cache_seconds']);
        exit;
    }

    $srcImg = createImageFromFile($originalPath, $ext);
    if (!$srcImg) {
        streamFileWithCacheHeaders($originalPath, $ext, $config['browser_cache_seconds']);
        exit;
    }

    $origW = imagesx($srcImg);
    $origH = imagesy($srcImg);

    // Calcula dimensões finais
    if ($fit === 'crop' && $reqW > 0 && $reqH > 0) {
        // Modo corte centralizado (quadrado ou proporção fixa exata)
        $ratio = max($reqW / $origW, $reqH / $origH);
        $cropW = (int)round($reqW / $ratio);
        $cropH = (int)round($reqH / $ratio);
        $srcX = (int)round(($origW - $cropW) / 2);
        $srcY = (int)round(($origH - $cropH) / 2);

        $dstImg = imagecreatetruecolor($reqW, $reqH);
        preserveTransparency($dstImg, $ext);
        imagecopyresampled($dstImg, $srcImg, 0, 0, $srcX, $srcY, $reqW, $reqH, $cropW, $cropH);
    } else {
        // Modo proporcional (contain)
        if ($reqW > 0 && $reqH > 0) {
            $ratio = min($reqW / $origW, $reqH / $origH);
        } elseif ($reqW > 0) {
            $ratio = $reqW / $origW;
        } else {
            $ratio = $reqH / $origH;
        }
        $targetW = max(1, (int)round($origW * $ratio));
        $targetH = max(1, (int)round($origH * $ratio));

        $dstImg = imagecreatetruecolor($targetW, $targetH);
        preserveTransparency($dstImg, $ext);
        imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $targetW, $targetH, $origW, $origH);
    }

    // Salva no cache
    saveImageToFile($dstImg, $cachePath, $ext, $quality);

    // Libera memória
    imagedestroy($srcImg);
    imagedestroy($dstImg);

    // Entrega ao navegador
    streamFileWithCacheHeaders($cachePath, $ext, $config['browser_cache_seconds']);
}

/**
 * Cria recurso GD a partir do arquivo
 */
function createImageFromFile($path, $ext) {
    switch ($ext) {
        case 'jpg':
        case 'jpeg':
            return @imagecreatefromjpeg($path);
        case 'png':
            return @imagecreatefrompng($path);
        case 'webp':
            return function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false;
        case 'gif':
            return @imagecreatefromgif($path);
        default:
            return false;
    }
}

/**
 * Salva recurso GD no arquivo em disco
 */
function saveImageToFile($img, $path, $ext, $quality = 84) {
    switch ($ext) {
        case 'jpg':
        case 'jpeg':
            return @imagejpeg($img, $path, $quality);
        case 'png':
            $pngQuality = (int)round(9 - (9 * ($quality / 100)));
            return @imagepng($img, $path, max(0, min(9, $pngQuality)));
        case 'webp':
            if (function_exists('imagewebp')) {
                return @imagewebp($img, $path, $quality);
            }
            return @imagejpeg($img, $path, $quality);
        case 'gif':
            return @imagegif($img, $path);
        default:
            return @imagejpeg($img, $path, $quality);
    }
}

function preserveTransparency(&$img, $ext) {
    if ($ext === 'png' || $ext === 'webp') {
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledrectangle($img, 0, 0, imagesx($img), imagesy($img), $transparent);
    }
}

function streamFileWithCacheHeaders($filePath, $ext, $cacheSeconds) {
    $mtime = filemtime($filePath);
    $etag = '"' . md5($filePath . $mtime) . '"';

    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
    header('Cache-Control: public, max-age=' . $cacheSeconds . ', immutable');

    // Suporte a 304 Not Modified
    if (
        (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) ||
        (isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) && @strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= $mtime)
    ) {
        http_response_code(304);
        exit;
    }

    $mime = 'image/jpeg';
    if ($ext === 'png') $mime = 'image/png';
    elseif ($ext === 'webp') $mime = 'image/webp';
    elseif ($ext === 'gif') $mime = 'image/gif';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
}

// ============================================================================
// UPLOAD E OTIMIZAÇÃO DE ENTRADA
// ============================================================================
function handleUpload($config, $serverUrl) {
    // Validação de senha para API se não estiver em sessão web
    if (!isAuthenticated($config)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Acesso não autorizado. Envie a senha no header X-Access-Password ou campo password.']);
        exit;
    }

    $rawPayload = file_get_contents('php://input');
    $jsonData = json_decode($rawPayload, true);

    $tipo = $_REQUEST['tipo'] ?? $jsonData['tipo'] ?? 'geral';
    $tipo = preg_replace('/[^a-zA-Z0-9_-]/', '', $tipo);
    if (!$tipo) $tipo = 'coleta';

    $tempFilePath = null;
    $originalExtension = 'jpg';

    // 1. Caso A: Multipart $_FILES
    if (!empty($_FILES['image']) && is_uploaded_file($_FILES['image']['tmp_name'])) {
        $tempFilePath = $_FILES['image']['tmp_name'];
        $origName = $_FILES['image']['name'];
        $originalExtension = strtolower(pathinfo($origName, PATHINFO_EXTENSION)) ?: 'jpg';
    }
    // 2. Caso B: Base64 string via JSON ou POST
    else {
        $base64String = $_POST['image'] ?? $jsonData['image'] ?? $jsonData['base64'] ?? '';
        if (!empty($base64String)) {
            // Remove prefixo data:image/...;base64, se houver
            if (preg_match('/^data:image\/(\w+);base64,/', $base64String, $matches)) {
                $originalExtension = strtolower($matches[1]) === 'jpeg' ? 'jpg' : strtolower($matches[1]);
                $base64String = substr($base64String, strpos($base64String, ',') + 1);
            }
            $decoded = base64_decode($base64String);
            if ($decoded !== false) {
                $tempFilePath = tempnam(sys_get_temp_dir(), 'zap_up_');
                file_put_contents($tempFilePath, $decoded);
            }
        }
    }

    if (!$tempFilePath || !file_exists($tempFilePath)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Nenhuma imagem foi enviada ou formato inválido.']);
        exit;
    }

    // Valida extensão e imagem válida
    if (!in_array($originalExtension, $config['allowed_extensions'])) {
        $originalExtension = 'jpg';
    }

    // ========================================================================
    // DEDUPLICAÇÃO INTELIGENTE POR HASH (SHA-1)
    // Se o mesmo arquivo já foi enviado antes, reaproveita o existente
    // sem gerar arquivos duplicados em disco (evita lixo e economiza storage).
    // ========================================================================
    $fileHash = sha1_file($tempFilePath);
    $hashesFile = $config['upload_dir'] . '.hashes.json';
    $hashes = [];
    if (file_exists($hashesFile)) {
        $loadedHashes = json_decode(@file_get_contents($hashesFile), true);
        if (is_array($loadedHashes)) {
            $hashes = $loadedHashes;
        }
    }

    if (!empty($fileHash) && isset($hashes[$fileHash])) {
        $existingFilename = $hashes[$fileHash];
        $existingPath = $config['upload_dir'] . $existingFilename;
        if (file_exists($existingPath) && is_file($existingPath)) {
            if (file_exists($tempFilePath) && strpos($tempFilePath, sys_get_temp_dir()) !== false) {
                @unlink($tempFilePath);
            }
            $info = @getimagesize($existingPath);
            $width = $info[0] ?? 0;
            $height = $info[1] ?? 0;
            $sizeKb = round(filesize($existingPath) / 1024, 1);
            $publicUrl = "{$serverUrl}?f={$existingFilename}";
            $thumbUrl = "{$serverUrl}?f={$existingFilename}&w=200&h=200&fit=crop";

            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success'      => true,
                'deduplicated' => true,
                'message'      => 'Arquivo idêntico já existente. Retornando link do arquivo existente para evitar duplicidade de lixo!',
                'filename'     => $existingFilename,
                'url'          => $publicUrl,
                'thumb_url'    => $thumbUrl,
                'path'         => "/uploads/images/{$existingFilename}",
                'width'        => $width,
                'height'       => $height,
                'size_kb'      => $sizeKb,
                'tipo'         => $tipo,
                'hash'         => $fileHash
            ]);
            exit;
        }
    }

    // Gera nome de arquivo seguro e único
    $timestamp = time();
    $randomHash = substr(md5(uniqid(mt_rand(), true)), 0, 8);
    $finalFilename = "{$timestamp}_{$tipo}_{$randomHash}.{$originalExtension}";
    $destinationPath = $config['upload_dir'] . $finalFilename;

    // Redimensionamento e otimização inicial ao entrar
    $optimized = optimizeAndSaveInitialImage($tempFilePath, $destinationPath, $originalExtension, $config);

    if (file_exists($tempFilePath) && strpos($tempFilePath, sys_get_temp_dir()) !== false) {
        @unlink($tempFilePath);
    }

    if (!$optimized) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Falha ao processar e salvar a imagem no disco.']);
        exit;
    }

    // Registra hash para evitar duplicados futuros
    if (!empty($fileHash)) {
        $hashes[$fileHash] = $finalFilename;
        $savedHash = @sha1_file($destinationPath);
        if (!empty($savedHash)) {
            $hashes[$savedHash] = $finalFilename;
        }
        @file_put_contents($hashesFile, json_encode($hashes, JSON_PRETTY_PRINT));
    }

    $info = @getimagesize($destinationPath);
    $width = $info[0] ?? 0;
    $height = $info[1] ?? 0;
    $sizeKb = round(filesize($destinationPath) / 1024, 1);

    $publicUrl = "{$serverUrl}?f={$finalFilename}";
    $thumbUrl = "{$serverUrl}?f={$finalFilename}&w=200&h=200&fit=crop";

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'    => true,
        'message'    => 'Imagem enviada e redimensionada com sucesso!',
        'filename'   => $finalFilename,
        'url'        => $publicUrl,
        'thumb_url'  => $thumbUrl,
        'path'       => "/uploads/images/{$finalFilename}",
        'width'      => $width,
        'height'     => $height,
        'size_kb'    => $sizeKb,
        'tipo'       => $tipo
    ]);
    exit;
}

/**
 * Otimiza e redimensiona a imagem para caber no limite inicial (max 1600px)
 */
function optimizeAndSaveInitialImage($srcPath, $dstPath, $ext, $config) {
    if (!extension_loaded('gd')) {
        return @copy($srcPath, $dstPath);
    }

    $srcImg = createImageFromFile($srcPath, $ext);
    if (!$srcImg) {
        return @copy($srcPath, $dstPath);
    }

    $w = imagesx($srcImg);
    $h = imagesy($srcImg);
    $maxW = $config['max_initial_width'];
    $maxH = $config['max_initial_height'];

    // Se já estiver dentro do tamanho ideal, apenas recompacta com qualidade excelente
    if ($w <= $maxW && $h <= $maxH) {
        $saved = saveImageToFile($srcImg, $dstPath, $ext, $config['initial_jpeg_quality']);
        imagedestroy($srcImg);
        return $saved;
    }

    // Redimensiona mantendo a proporção de aspecto
    $ratio = min($maxW / $w, $maxH / $h);
    $newW = (int)round($w * $ratio);
    $newH = (int)round($h * $ratio);

    $dstImg = imagecreatetruecolor($newW, $newH);
    preserveTransparency($dstImg, $ext);
    imagecopyresampled($dstImg, $srcImg, 0, 0, 0, 0, $newW, $newH, $w, $h);

    $saved = saveImageToFile($dstImg, $dstPath, $ext, $config['initial_jpeg_quality']);

    imagedestroy($srcImg);
    imagedestroy($dstImg);
    return $saved;
}

function handleDelete($config) {
    if (!isAuthenticated($config)) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Não autorizado.']);
        exit;
    }

    $filename = basename(trim($_REQUEST['f'] ?? $_REQUEST['file'] ?? ''));
    if (!$filename) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => 'Arquivo não informado.']);
        exit;
    }

    $filePath = $config['upload_dir'] . $filename;
    $deleted = false;
    if (file_exists($filePath)) {
        $deleted = @unlink($filePath);
    }

    // Limpa também as miniaturas do cache correspondentes a esse arquivo
    $cacheFiles = glob($config['cache_dir'] . "*_{$filename}");
    if ($cacheFiles) {
        foreach ($cacheFiles as $cf) {
            @unlink($cf);
        }
    }

    // Remove do índice de hashes
    $hashesFile = $config['upload_dir'] . '.hashes.json';
    if (file_exists($hashesFile)) {
        $hashes = json_decode(@file_get_contents($hashesFile), true);
        if (is_array($hashes)) {
            $newHashes = array_filter($hashes, function($val) use ($filename) {
                return $val !== $filename;
            });
            @file_put_contents($hashesFile, json_encode($newHashes, JSON_PRETTY_PRINT));
        }
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => $deleted, 'message' => $deleted ? 'Imagem excluída com sucesso.' : 'Arquivo não encontrado.']);
    exit;
}

function handleListImages($config, $serverUrl) {
    $rawFiles = glob($config['upload_dir'] . '*.*');
    $files = [];

    // Ignora arquivos internos de controle e ocultos (ex: .hashes.json)
    if ($rawFiles) {
        foreach ($rawFiles as $rf) {
            $bn = basename($rf);
            if ($bn[0] === '.' || substr($bn, -5) === '.json') continue;
            $files[] = $rf;
        }
    }

    // Parâmetros de filtro, ordenação e paginação
    $dateFrom = $_REQUEST['date_from'] ?? ''; // formato YYYY-MM-DD
    $dateTo = $_REQUEST['date_to'] ?? '';     // formato YYYY-MM-DD
    $sort = $_REQUEST['sort'] ?? 'date_desc';  // date_desc | date_asc | size_desc | size_asc | name_asc
    $page = max(1, (int)($_REQUEST['page'] ?? 1));
    $limit = max(1, min(100, (int)($_REQUEST['limit'] ?? 24)));

    // Filtro por Data de Upload
    if (!empty($dateFrom) || !empty($dateTo)) {
        $fromTs = !empty($dateFrom) ? @strtotime($dateFrom . ' 00:00:00') : 0;
        $toTs = !empty($dateTo) ? @strtotime($dateTo . ' 23:59:59') : PHP_INT_MAX;

        $files = array_filter($files, function($f) use ($fromTs, $toTs) {
            $mtime = filemtime($f);
            return $mtime >= $fromTs && $mtime <= $toTs;
        });
        $files = array_values($files);
    }

    // Ordenação
    usort($files, function($a, $b) use ($sort) {
        if ($sort === 'date_asc') {
            return filemtime($a) - filemtime($b);
        } elseif ($sort === 'size_desc') {
            return filesize($b) - filesize($a);
        } elseif ($sort === 'size_asc') {
            return filesize($a) - filesize($b);
        } elseif ($sort === 'name_asc') {
            return strcasecmp(basename($a), basename($b));
        }
        // Padrão: mais recentes primeiro (date_desc)
        return filemtime($b) - filemtime($a);
    });

    $total = count($files);
    $totalPages = (int)ceil($total / $limit);
    if ($totalPages < 1) $totalPages = 1;
    $offset = ($page - 1) * $limit;
    $pagedFiles = array_slice($files, $offset, $limit);

    $results = [];
    foreach ($pagedFiles as $file) {
        $fn = basename($file);
        $sizeKb = round(filesize($file) / 1024, 1);
        $mtime = filemtime($file);
        $info = @getimagesize($file);

        $results[] = [
            'filename'   => $fn,
            'url'        => "{$serverUrl}?f={$fn}",
            'thumb_url'  => "{$serverUrl}?f={$fn}&w=240&h=240&fit=crop",
            'size_kb'    => $sizeKb,
            'width'      => $info[0] ?? 0,
            'height'     => $info[1] ?? 0,
            'created_at' => date('d/m/Y H:i:s', $mtime),
            'date_iso'   => date('Y-m-d', $mtime),
            'timestamp'  => $mtime
        ];
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'     => true,
        'total'       => $total,
        'page'        => $page,
        'limit'       => $limit,
        'total_pages' => $totalPages,
        'date_from'   => $dateFrom,
        'date_to'     => $dateTo,
        'sort'        => $sort,
        'images'      => $results
    ]);
    exit;
}

// ============================================================================
// TEMPLATES HTML: LOGIN E PAINEL ADMINISTRATIVO COM INTERFACE MODERNA
// ============================================================================

function renderLoginPage($error = null, $serverUrl = '') {
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Servidor de Imagens EncomendasZap - Acesso Seguro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>body { font-family: 'Plus Jakarta Sans', sans-serif; }</style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        <div class="text-center mb-6">
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0B5187] to-[#FF5E00] flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#0B5187]/30">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                </svg>
            </div>
            <h1 class="text-xl font-black text-white">Servidor de Imagens</h1>
            <p class="text-xs text-slate-400 font-medium mt-1">EncomendasZap Image Hub & CDN</p>
        </div>

        <?php if ($error): ?>
            <div class="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold text-center">
                <?= htmlspecialchars($error) ?>
            </div>
        <?php endif; ?>

        <form method="POST" class="space-y-4">
            <div>
                <label class="block text-xs font-bold text-slate-300 mb-1.5">Senha de Acesso</label>
                <div class="relative">
                    <input 
                        type="password" 
                        name="login_password" 
                        required 
                        autofocus
                        placeholder="Digite a senha de acesso..." 
                        class="w-full px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-sm font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FF5E00] focus:ring-1 focus:ring-[#FF5E00] transition-all"
                    >
                </div>
            </div>

            <button 
                type="submit" 
                class="w-full py-3 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-[#0B5187] to-[#083D66] hover:from-[#083D66] hover:to-[#0B5187] active:scale-[0.99] shadow-lg shadow-[#0B5187]/30 transition-all cursor-pointer"
            >
                Acessar Imagens
            </button>
        </form>

        <div class="mt-6 pt-5 border-t border-slate-700/60 text-center">
            <p class="text-[11px] text-slate-400">
                URL Endpoint API: <br>
                <code class="text-amber-400 font-mono text-[10px] bg-slate-900/60 px-2 py-0.5 rounded mt-1 inline-block"><?= htmlspecialchars($serverUrl) ?></code>
            </p>
        </div>
    </div>
</body>
</html>
<?php
}

function renderAdminDashboard($config, $serverUrl) {
    $files = glob($config['upload_dir'] . '*.*');
    $totalCount = count($files);
    $totalBytes = 0;
    if ($files) {
        foreach ($files as $f) {
            $totalBytes += filesize($f);
        }
    }
    $totalMb = round($totalBytes / (1024 * 1024), 2);
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Galeria e Gerenciador de Imagens - EncomendasZap</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .tab-btn.active { background-color: #0B5187; color: white; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col">
    <!-- Header Superior -->
    <header class="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#0B5187] to-[#FF5E00] flex items-center justify-center shadow-md shadow-[#0B5187]/30">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="18" height="18" rx="4" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                </svg>
            </div>
            <div>
                <h1 class="text-sm sm:text-base font-black text-white leading-tight">Servidor de Imagens & CDN</h1>
                <p class="text-[11px] text-slate-400 font-semibold">EncomendasZap • Otimização Dinâmica de Tráfego</p>
            </div>
        </div>

        <div class="flex items-center gap-2.5">
            <div class="hidden sm:flex items-center gap-2 text-xs bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="font-bold text-slate-300"><?= $totalCount ?> fotos (<?= $totalMb ?> MB)</span>
            </div>

            <a href="?action=logout" class="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all">
                Sair
            </a>
        </div>
    </header>

    <!-- Conteúdo Principal -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <!-- Banner Informativo da URL do Servidor com botão de copiar -->
        <div class="bg-gradient-to-r from-blue-900/40 via-slate-900 to-amber-900/20 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
            <div>
                <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20 mb-1.5">
                    ⚙️ Configuração do Sistema
                </span>
                <h2 class="text-sm sm:text-base font-bold text-white">URL Oficial do Servidor de Imagens</h2>
                <p class="text-xs text-slate-400 mt-0.5">Cole este endereço na seção de <strong>Configurações do Sistema</strong> do seu App:</p>
            </div>

            <div class="flex items-center gap-2">
                <input 
                    id="serverUrlInput"
                    type="text" 
                    readonly 
                    value="<?= htmlspecialchars($serverUrl) ?>" 
                    class="bg-slate-950/80 border border-slate-700 text-xs font-mono text-emerald-400 px-3.5 py-2.5 rounded-xl outline-none select-all w-64 sm:w-80 truncate"
                >
                <button 
                    onclick="copyServerUrl()" 
                    id="copyBtn"
                    class="px-4 py-2.5 bg-[#FF5E00] hover:bg-[#e05300] text-white text-xs font-black rounded-xl shadow-md transition-all shrink-0 cursor-pointer"
                >
                    Copiar URL
                </button>
            </div>
        </div>

        <!-- Seção de Upload Direto (Drag & Drop) -->
        <div class="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-5 shadow-md">
            <h3 class="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Enviar Novas Imagens</h3>
            <div 
                id="dropZone" 
                class="border-2 border-dashed border-slate-700 hover:border-[#FF5E00] bg-slate-950/40 hover:bg-slate-900/60 rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer"
                onclick="document.getElementById('fileInput').click()"
            >
                <input type="file" id="fileInput" multiple accept="image/*" class="hidden" onchange="handleFileSelect(this.files)">
                <div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <svg class="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                </div>
                <p class="text-sm font-bold text-white">Arraste fotos aqui ou <span class="text-[#FF5E00] underline">clique para selecionar</span></p>
                <p class="text-xs text-slate-500 mt-1">As imagens são automaticamente otimizadas e redimensionadas para max 1600px ao entrar.</p>
                <div id="uploadProgress" class="hidden mt-4 text-xs font-bold text-amber-400">Enviando imagens...</div>
            </div>
        </div>

        <!-- Barra de Busca e Filtros de Imagens -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div class="relative w-full sm:w-80">
                <input 
                    type="text" 
                    id="searchFilter" 
                    placeholder="Filtrar por nome ou tipo (coleta, entrega...)"
                    oninput="filterImages(this.value)"
                    class="w-full pl-9 pr-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-white placeholder:text-slate-500 outline-none focus:border-[#0B5187]"
                >
                <svg class="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </div>

            <div class="flex items-center gap-2 self-end sm:self-auto text-xs font-bold text-slate-400">
                <span>Modo de Exibição Dinâmica:</span>
                <span class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">?w=300&h=300</span>
            </div>
        </div>

        <!-- Grade de Imagens (Grid) -->
        <div id="imagesGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            <div class="col-span-full text-center py-12 text-slate-500 text-xs font-bold">
                Carregando imagens...
            </div>
        </div>
    </main>

    <!-- Modal de Visualização & Gerador de Tamanhos -->
    <div id="previewModal" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onclick="closeModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer">
                ✕
            </button>

            <h3 id="modalTitle" class="text-sm font-bold text-white truncate pr-10 mb-4">Visualizador de Imagem</h3>

            <div class="bg-slate-950 rounded-2xl overflow-hidden mb-4 flex items-center justify-center min-h-[220px] max-h-[380px] border border-slate-800">
                <img id="modalImg" src="" alt="Foto" class="max-h-[380px] max-w-full object-contain">
            </div>

            <!-- Links para Diferentes Tamanhos (Tráfego Otimizado) -->
            <div class="space-y-3">
                <div class="text-xs font-bold text-slate-300">Links Prontos por Tamanho (Economia de Tráfego):</div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button onclick="copySizeUrl('icon')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition-all cursor-pointer">
                        <div class="text-[11px] font-black text-amber-400">Mini Ícone (64px)</div>
                        <div class="text-[10px] text-slate-400">Ideal para pins do mapa</div>
                    </button>
                    <button onclick="copySizeUrl('thumb')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition-all cursor-pointer">
                        <div class="text-[11px] font-black text-emerald-400">Miniatura (200px)</div>
                        <div class="text-[10px] text-slate-400">Ideal para listas e cards</div>
                    </button>
                    <button onclick="copySizeUrl('md')" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-left border border-slate-700 transition-all cursor-pointer">
                        <div class="text-[11px] font-black text-blue-400">Médio (500px)</div>
                        <div class="text-[10px] text-slate-400">Exibição padrão</div>
                    </button>
                </div>

                <div class="flex items-center gap-2 pt-2">
                    <input id="modalUrlInput" type="text" readonly class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-300">
                    <button onclick="copyModalUrl()" id="modalCopyBtn" class="px-4 py-2 bg-[#0B5187] hover:bg-[#083D66] text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer">
                        Copiar URL
                    </button>
                    <button onclick="deleteCurrentModalImg()" class="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl shrink-0 cursor-pointer">
                        Excluir
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const SERVER_URL = '<?= $serverUrl ?>';
        let allImages = [];
        let currentModalFilename = '';

        async function loadImages() {
            try {
                const res = await fetch('?action=list');
                const data = await res.json();
                if (data.success && Array.isArray(data.images)) {
                    allImages = data.images;
                    renderGrid(allImages);
                }
            } catch (err) {
                document.getElementById('imagesGrid').innerHTML = '<div class="col-span-full text-center text-rose-400 text-xs py-8">Erro ao carregar lista de imagens.</div>';
            }
        }

        function renderGrid(images) {
            const container = document.getElementById('imagesGrid');
            if (!images || images.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500 text-xs font-bold">Nenhuma imagem armazenada ainda. Faça o upload acima!</div>';
                return;
            }

            container.innerHTML = images.map(img => `
                <div class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden group shadow-md transition-all flex flex-col">
                    <div class="aspect-square bg-slate-950 relative overflow-hidden cursor-pointer" onclick="openModal('${img.filename}')">
                        <img src="${img.thumb_url}" alt="${img.filename}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                        <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                            <span class="bg-[#0B5187] text-white text-[10px] font-black px-2 py-1 rounded-md">Ver / Copiar</span>
                        </div>
                    </div>
                    <div class="p-2.5 flex-1 flex flex-col justify-between">
                        <p class="text-[11px] font-bold text-slate-300 truncate" title="${img.filename}">${img.filename}</p>
                        <div class="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                            <span>${img.size_kb} KB</span>
                            <span>${img.width}x${img.height}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function filterImages(term) {
            const clean = term.toLowerCase().trim();
            if (!clean) {
                renderGrid(allImages);
                return;
            }
            const filtered = allImages.filter(img => img.filename.toLowerCase().includes(clean));
            renderGrid(filtered);
        }

        function openModal(filename) {
            currentModalFilename = filename;
            const img = allImages.find(i => i.filename === filename);
            if (!img) return;

            document.getElementById('modalTitle').textContent = img.filename + ' (' + img.width + 'x' + img.height + ', ' + img.size_kb + ' KB)';
            document.getElementById('modalImg').src = img.url;
            document.getElementById('modalUrlInput').value = img.url;
            document.getElementById('previewModal').classList.remove('hidden');
        }

        function closeModal() {
            document.getElementById('previewModal').classList.add('hidden');
        }

        function copySizeUrl(size) {
            const url = SERVER_URL + '?f=' + encodeURIComponent(currentModalFilename) + '&size=' + size;
            navigator.clipboard.writeText(url);
            alert('URL no tamanho (' + size + ') copiada com sucesso!\n' + url);
        }

        function copyModalUrl() {
            const input = document.getElementById('modalUrlInput');
            navigator.clipboard.writeText(input.value);
            const btn = document.getElementById('modalCopyBtn');
            btn.textContent = 'Copiado!';
            setTimeout(() => btn.textContent = 'Copiar URL', 2000);
        }

        async function deleteCurrentModalImg() {
            if (!confirm('Deseja realmente excluir esta imagem permanentemente?')) return;
            try {
                const res = await fetch('?action=delete&f=' + encodeURIComponent(currentModalFilename), { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    closeModal();
                    loadImages();
                } else {
                    alert(data.message || 'Erro ao excluir');
                }
            } catch (e) {
                alert('Erro de conexão ao excluir.');
            }
        }

        function copyServerUrl() {
            const input = document.getElementById('serverUrlInput');
            navigator.clipboard.writeText(input.value);
            const btn = document.getElementById('copyBtn');
            btn.textContent = 'Copiado!';
            setTimeout(() => btn.textContent = 'Copiar URL', 2500);
        }

        // Drag & drop upload handler
        const dropZone = document.getElementById('dropZone');
        ['dragenter', 'dragover'].forEach(e => {
            dropZone.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.add('border-[#FF5E00]'); });
        });
        ['dragleave', 'drop'].forEach(e => {
            dropZone.addEventListener(e, (evt) => { evt.preventDefault(); dropZone.classList.remove('border-[#FF5E00]'); });
        });
        dropZone.addEventListener('drop', (evt) => {
            handleFileSelect(evt.dataTransfer.files);
        });

        async function handleFileSelect(files) {
            if (!files || files.length === 0) return;
            const progress = document.getElementById('uploadProgress');
            progress.classList.remove('hidden');
            progress.textContent = 'Enviando ' + files.length + ' imagem(ns)...';

            for (const file of files) {
                const fd = new FormData();
                fd.append('action', 'upload');
                fd.append('image', file);
                try {
                    await fetch('?action=upload', { method: 'POST', body: fd });
                } catch (e) {
                    console.error('Erro no upload:', e);
                }
            }

            progress.textContent = 'Upload concluído com sucesso!';
            setTimeout(() => progress.classList.add('hidden'), 3000);
            loadImages();
        }

        // Inicia carregamento
        loadImages();
    </script>
</body>
</html>
<?php
}
