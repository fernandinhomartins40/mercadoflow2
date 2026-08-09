package com.pdv2cloud.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterRequest {

    @Email(message = "Informe um e-mail válido")
    @NotBlank(message = "Informe o e-mail")
    private String email;

    /**
     * Senha forte, validada aqui e não só no formulário.
     *
     * A regra existir apenas no frontend não protege nada: quem chamar a API
     * diretamente passaria com uma senha de um caractere. Os requisitos são os
     * mesmos exibidos na tela, para o usuário nunca ser recusado por uma regra
     * que ele não viu.
     */
    @NotBlank(message = "Informe a senha")
    @Size(min = 8, message = "A senha precisa de pelo menos 8 caracteres")
    @Pattern(
        regexp = "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$",
        message = "A senha precisa de letra maiúscula, minúscula, número e caractere especial"
    )
    private String password;

    @NotBlank(message = "Informe o nome do responsável")
    private String name;

    private String marketName;

    private String marketCnpj;

    private String marketPhone;

    /**
     * Plano escolhido na tela de cadastro. A conta sempre nasce no gratuito —
     * este campo só registra a intenção, para o checkout ser oferecido logo
     * após o primeiro acesso. Exigir pagamento antes de entrar derrubaria a
     * conversão que o plano gratuito existe para criar.
     */
    private String intendedPlan;
}
