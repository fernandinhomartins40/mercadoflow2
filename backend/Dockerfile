FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/pdv2cloud-backend-1.0.0.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
