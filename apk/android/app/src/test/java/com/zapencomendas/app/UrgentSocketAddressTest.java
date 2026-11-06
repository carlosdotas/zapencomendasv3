package com.zapencomendas.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class UrgentSocketAddressTest {
    @Test
    public void acceptsSecureTrackingSocketAndLocalDevelopment() {
        assertTrue(UrgentSocketAddress.isValid("wss://zapencomendas.ai.studio/ws/tracking"));
        assertTrue(UrgentSocketAddress.isValid("ws://localhost:3000/ws/tracking"));
        assertTrue(UrgentSocketAddress.isValid("ws://127.0.0.1:3000/ws/tracking"));
    }

    @Test
    public void rejectsInsecureOrMalformedTrackingSocket() {
        assertFalse(UrgentSocketAddress.isValid(null));
        assertFalse(UrgentSocketAddress.isValid("ws://example.com/ws/tracking"));
        assertFalse(UrgentSocketAddress.isValid("wss://example.com/other"));
        assertFalse(UrgentSocketAddress.isValid("wss://user@example.com/ws/tracking"));
        assertFalse(UrgentSocketAddress.isValid("wss://example.com/ws/tracking?token=x"));
    }
}
