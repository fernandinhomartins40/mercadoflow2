package com.pdv2cloud.exception;

public class CustomExceptions {
    public static class InvalidSignature extends RuntimeException {
        public InvalidSignature(String message) {
            super(message);
        }
    }

    public static class NotFound extends RuntimeException {
        public NotFound(String message) {
            super(message);
        }
    }
}
