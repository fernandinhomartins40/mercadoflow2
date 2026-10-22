package com.pdv2cloud.job;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.InvoiceRepository;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.ProductRepository;
import com.pdv2cloud.repository.SalesAnalyticsRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class DailyAggregationJobTest {

    private final InvoiceRepository invoices = mock(InvoiceRepository.class);
    private final SalesAnalyticsRepository analytics = mock(SalesAnalyticsRepository.class);
    private final MarketRepository markets = mock(MarketRepository.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
    private final DailyAggregationJob job = new DailyAggregationJob();

    DailyAggregationJobTest() {
        ReflectionTestUtils.setField(job, "invoiceRepository", invoices);
        ReflectionTestUtils.setField(job, "analyticsRepository", analytics);
        ReflectionTestUtils.setField(job, "marketRepository", markets);
        ReflectionTestUtils.setField(job, "productRepository", mock(ProductRepository.class));
        ReflectionTestUtils.setField(job, "tx", new TransactionTemplate(txManager));
    }

    private Market market() {
        Market m = new Market();
        m.setId(UUID.randomUUID());
        return m;
    }

    @Test
    void recalculaOsUltimosDiasDentroDeTransacao() {
        Market m = market();
        when(markets.findAllActive()).thenReturn(List.of(m));

        job.aggregateDailySales();

        LocalDate yesterday = LocalDate.now().minusDays(1);
        verify(analytics).deleteByMarketAndDate(m.getId(), yesterday);
        verify(analytics).deleteByMarketAndDate(m.getId(), yesterday.minusDays(DailyAggregationJob.DAYS_BACK - 1));
        verify(txManager, times(DailyAggregationJob.DAYS_BACK)).getTransaction(any());
    }

    @Test
    void falhaDeUmMercadoNaoInterrompeOsOutros() {
        Market quebrado = market();
        Market ok = market();
        when(markets.findAllActive()).thenReturn(List.of(quebrado, ok));
        doThrow(new IllegalStateException("boom")).when(analytics).deleteByMarketAndDate(eq(quebrado.getId()), any());

        job.aggregateDailySales();

        verify(analytics, times(DailyAggregationJob.DAYS_BACK)).deleteByMarketAndDate(eq(ok.getId()), any());
        verify(txManager, times(DailyAggregationJob.DAYS_BACK)).rollback(any());
    }
}
