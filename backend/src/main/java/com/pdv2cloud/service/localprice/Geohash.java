package com.pdv2cloud.service.localprice;

/** Geohash (base32), o formato de localização que o Menor Preço recebe em {@code local}. */
final class Geohash {

    private static final char[] BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz".toCharArray();

    private Geohash() {
    }

    static String encode(double latitude, double longitude, int precision) {
        double[] lat = { -90, 90 };
        double[] lon = { -180, 180 };
        StringBuilder out = new StringBuilder();
        boolean even = true;
        int bit = 0;
        int ch = 0;
        while (out.length() < precision) {
            double[] range = even ? lon : lat;
            double value = even ? longitude : latitude;
            double mid = (range[0] + range[1]) / 2;
            if (value >= mid) {
                ch |= 1 << (4 - bit);
                range[0] = mid;
            } else {
                range[1] = mid;
            }
            even = !even;
            if (++bit == 5) {
                out.append(BASE32[ch]);
                bit = 0;
                ch = 0;
            }
        }
        return out.toString();
    }
}
