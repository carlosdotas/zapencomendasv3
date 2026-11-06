package com.zapencomendas.app;

final class ApkUpdateVersion {
    private ApkUpdateVersion() {}

    static boolean isUpdateRequired(long installedVersionCode, long availableVersionCode) {
        return installedVersionCode > 0 && availableVersionCode > installedVersionCode;
    }
}
