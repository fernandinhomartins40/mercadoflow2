FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
# Esta camada so muda quando o grafo Maven muda. Assim, alteracoes em src nao
# baixam novamente dependencias e plugins no runner do GitHub Actions.
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM mwader/static-ffmpeg:9.0 AS ffmpeg

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN apk add --no-cache fontconfig font-dejavu
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
RUN ffmpeg -version >/dev/null && ffprobe -version >/dev/null
COPY --from=build /app/target/pdv2cloud-backend-1.0.0.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
