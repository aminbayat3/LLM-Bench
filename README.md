# LLM Benchmarking & Stress Testing Framework

## 🚀 Overview
This project provides a **controlled benchmarking and stress testing framework** for evaluating different **Large Language Model (LLM) runtimes**.  
It enables you to deploy models across various backends (e.g., **Ollama, WASM, containerized servers**) inside a **customizable Kubernetes environment**, and benchmark them under configurable load.

The framework is designed to answer key questions:
- How do different LLM runtimes behave under stress?
- What are their latency, throughput, and resource efficiency profiles?
- How do they scale across CPU- and GPU-enabled clusters?

---

## 📊 What We Measure
The benchmarking harness collects and reports the following key inference metrics:

- **Time To First Token (TTFT)** ⏱️  
- **Total Inference Time** ⌛  
- **Tokens per Second (TPS)** ⚡  
- **Resource Consumption**  
  - CPU usage  
  - GPU utilization  
  - Memory footprint  
  - Network throughput  

Metrics are exported to **Prometheus** and visualized in **Grafana**, enabling **side-by-side comparisons across models and runtimes**.

---

## 📖 Project Explanation
The full project explanation is available here:

👉 [Google Doc Project Explanation](https://docs.google.com/document/d/11S64ulDxScZ3bRxEUnB0KBwKIzfxGb6Q2nFHGBKn3X0/edit?usp=sharing)

## 📖 Project Set-Up
The full project Set-up, including the steps and commands, is available here:

👉 [Google Doc Project Report Production Set-Up (GKE Standard)](https://docs.google.com/document/d/1m6OE4F5If7MY9WIQyUOuBooQ4LAjLGnb4gFa1V3fu_g/edit?usp=sharing)

👉 [Google Doc Project Report Local Set-Up (Minikube)](https://docs.google.com/document/d/1q4bytgs0u2ekm78C5eSSyBwFT_mKFwyn2y8HwxeWOow/edit?usp=sharing)

**The local setup was intended solely for testing prior to production deployment.**

---

## ⚡ Quick Start (Production)

## 1. Create Namespaces
```bash
kubectl create namespace llm-bench
```
```bash
kubectl create namespace monitoring
```

### 2. Build & Push Benchclient Image
```bash
docker build -t europe-west3-docker.pkg.dev/PROJECT_ID/llm-bench/benchclient:1.0.0 .
```
```bash
docker push europe-west3-docker.pkg.dev/PROJECT_ID/llm-bench/benchclient:1.0.0
```

### 3. Deploy to GKE
```bash
kubectl apply -f k8s/gke/ollama-gemma.yaml
```
```bash
kubectl apply -f k8s/gke/benchclient-gke.yaml
```
```bash
helm install prometheus prometheus-community/prometheus \
  -n monitoring --create-namespace \
  -f k8s/gke/prometheus-values.yaml
```

---

## 🏗️ Architecture
```mermaid
flowchart TD
    subgraph Cluster["Kubernetes Cluster - Minikube or GKE Standard"]
        subgraph Runtime["LLM Runtime Deployment"]
            A1["Ollama + Gemma"] 
            A2["WASM Runtime + LLM"] 
            A3["Containerized LLM Server"] 
        end

        subgraph Bench["Benchmark Client Deployment"]
            B1["Node.js / Python Client"]
            B1 -->|Sends prompts| Runtime
            B1 -->|/metrics endpoint| Prom
        end

        subgraph Monitoring["Monitoring Stack"]
            Prom["Prometheus"]
            Graf["Grafana"]
            Prom --> Graf
        end

        subgraph Nodes["Node Pools"]
            N1["CPU Nodes"]
            N2["GPU Nodes"]
            N3["Tools Nodes"]
        end
    end

    Runtime -->|LLM Response| B1
    N1 -.scheduling.-> Runtime
    N2 -.gpu workloads.-> Runtime
    N3 -.tools only.-> Prom
