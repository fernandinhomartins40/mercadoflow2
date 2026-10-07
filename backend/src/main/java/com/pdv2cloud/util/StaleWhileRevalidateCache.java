package com.pdv2cloud.util;

import com.pdv2cloud.tenancy.TenantContext;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;

/**
 * Cache em memória por mercado para leituras analíticas pesadas e pouco
 * sensíveis ao minuto (90 dias de cupons não mudam de um clique para outro).
 *
 * Fresco: devolve na hora. Velho: devolve o que tem na hora e recalcula em
 * segundo plano, uma vez só. Vazio: calcula na requisição (só a primeira vez).
 * O recálculo em segundo plano roda com o tenant do mercado, então a RLS vale.
 */
@Slf4j
public class StaleWhileRevalidateCache<T> {

    private record Entry<T>(T value, long at) { }

    private static final ExecutorService REFRESH = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "swr-cache-refresh");
        t.setDaemon(true);
        return t;
    });

    private final long ttlMillis;
    private final Map<UUID, Entry<T>> entries = new ConcurrentHashMap<>();
    private final Map<UUID, CompletableFuture<T>> running = new ConcurrentHashMap<>();

    public StaleWhileRevalidateCache(Duration ttl) {
        this.ttlMillis = ttl.toMillis();
    }

    public T get(UUID marketId, Supplier<T> compute) {
        Entry<T> e = entries.get(marketId);
        if (e != null) {
            if (System.currentTimeMillis() - e.at() > ttlMillis) refreshInBackground(marketId, compute);
            return e.value();
        }
        // Primeira vez: duas abas abrindo juntas esperam o mesmo cálculo.
        CompletableFuture<T> mine = new CompletableFuture<>();
        CompletableFuture<T> other = running.putIfAbsent(marketId, mine);
        if (other != null) return other.join();
        try {
            T value = compute.get();
            entries.put(marketId, new Entry<>(value, System.currentTimeMillis()));
            mine.complete(value);
            return value;
        } catch (RuntimeException ex) {
            mine.completeExceptionally(ex);
            throw ex;
        } finally {
            running.remove(marketId);
        }
    }

    public void invalidate(UUID marketId) {
        entries.remove(marketId);
    }

    private void refreshInBackground(UUID marketId, Supplier<T> compute) {
        CompletableFuture<T> mine = new CompletableFuture<>();
        if (running.putIfAbsent(marketId, mine) != null) return;
        REFRESH.submit(() -> {
            TenantContext.set(new TenantContext.TenantInfo(marketId, false));
            try {
                T value = compute.get();
                entries.put(marketId, new Entry<>(value, System.currentTimeMillis()));
                mine.complete(value);
            } catch (RuntimeException ex) {
                log.warn("Recálculo em segundo plano falhou (mercado {}): {}", marketId, ex.getMessage());
                mine.completeExceptionally(ex);
            } finally {
                TenantContext.clear();
                running.remove(marketId);
            }
        });
    }
}
