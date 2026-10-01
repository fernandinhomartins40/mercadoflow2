package com.pdv2cloud.exception;

/**
 * Senha certa, mas a conta não pode entrar agora: o motivo vai para a tela
 * (só depois de a senha ser conferida, para não revelar contas a quem não a sabe).
 */
public class AccountAccessException extends RuntimeException {

    private final String state;

    public AccountAccessException(String state, String message) {
        super(message);
        this.state = state;
    }

    public String getState() {
        return state;
    }
}
