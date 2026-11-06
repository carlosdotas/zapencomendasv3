package com.zapencomendas.app;

import java.net.URI;
import java.net.URISyntaxException;

final class UrgentSocketAddress {
    static boolean isValid(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value);
            String host = uri.getHost();
            if (host == null || uri.getUserInfo() != null || uri.getFragment() != null ||
                uri.getQuery() != null || !"/ws/tracking".equals(uri.getPath())) return false;
            if ("wss".equalsIgnoreCase(uri.getScheme())) return true;
            return "ws".equalsIgnoreCase(uri.getScheme()) &&
                ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host) || "[::1]".equals(host));
        } catch (URISyntaxException error) {
            return false;
        }
    }
}
