pipeline {
    agent any
    environment {
        DOCKER_HUB_USER = 'smitgedam'
        BACKEND_IMAGE   = "${DOCKER_HUB_USER}/devsecops-backend"
        FRONTEND_IMAGE  = "${DOCKER_HUB_USER}/devsecops-frontend"
        IMAGE_TAG       = "v${BUILD_NUMBER}"
        SONAR_HOST      = 'http://localhost:9000'
    }
    options {
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
        disableConcurrentBuilds()
    }
    stages {
        stage('Checkout') {
            steps {
                echo "=== Stage 1: Checkout ==="
                checkout scm
                sh 'echo "Commit: $(git rev-parse --short HEAD)"'
                sh 'ls -la'
                sh '''
                    echo "Ensuring SonarQube is running..."
                    if curl -sf --max-time 5 \
                      http://localhost:9000/api/system/status \
                      | grep -q UP; then
                      echo "SonarQube: already UP"
                    else
                      echo "SonarQube: starting..."
                      sudo systemctl start sonarqube
                      timeout 120 bash -c \
                        'until curl -sf \
                        http://localhost:9000/api/system/status \
                        | grep -q UP; \
                        do echo "waiting..."; sleep 10; done'
                      echo "SonarQube: UP"
                    fi
                '''
            }
        }
        stage('SonarQube Analysis') {
            steps {
                echo "=== Stage 2: SonarQube SAST ==="
                catchError(
                    buildResult: 'SUCCESS',
                    stageResult: 'UNSTABLE'
                ) {
                    withCredentials([string(
                        credentialsId: 'sonarqube-token',
                        variable: 'SONAR_TOKEN'
                    )]) {
                        sh '''
                            /opt/sonar-scanner/bin/sonar-scanner \
                              -Dsonar.projectKey=devsecops-app \
                              -Dsonar.projectName="DevSecOps App" \
                              -Dsonar.sources=backend,frontend/src \
                              -Dsonar.host.url=${SONAR_HOST} \
                              -Dsonar.token=${SONAR_TOKEN}
                        '''
                    }
                }
            }
        }
        stage('OWASP Dependency Check') {
            steps {
                echo "=== Stage 3: OWASP Dependency Scan ==="
                catchError(
                    buildResult: 'SUCCESS',
                    stageResult: 'UNSTABLE'
                ) {
                    withCredentials([string(
                        credentialsId: 'nvd-api-key',
                        variable: 'NVD_KEY'
                    )]) {
                        sh '''
                            echo "Installing project dependencies for accurate scan..."

                            # Backend dependencies
                            if [ -d "backend" ] && [ -f "backend/package.json" ]; then
                              cd backend
                              npm ci --prefer-offline || npm install
                              cd ..
                            fi

                            # Frontend dependencies
                            if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
                              cd frontend
                              npm ci --prefer-offline || npm install
                              cd ..
                            fi

                            echo "Starting OWASP Dependency Check..."
                            mkdir -p reports/dependency-check

                            /opt/dependency-check/bin/dependency-check.sh \
                              --project "devsecops-app" \
                              --scan ./backend \
                              --scan ./frontend \
                              --format HTML \
                              --format JSON \
                              --out ./reports/dependency-check \
                              --data /opt/dependency-check/data \
                              --nvdApiKey ${NVD_KEY} \
                              --nvdApiDelay 6000 \
                              --disableAssembly \
                              --failOnCVSS 9

                            echo "OWASP scan completed"
                        '''
                    }
                }
            }
            post {
                always {
                    publishHTML([
                        allowMissing: true,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'reports/dependency-check',
                        reportFiles: 'dependency-check-report.html',
                        reportName: 'OWASP Report'
                    ])
                }
            }
        }
        stage('Build Backend Image') {
            steps {
                echo "=== Stage 4: Build Backend Docker Image ==="
                sh '''
                    cd backend
                    docker build \
                      -t ${BACKEND_IMAGE}:${IMAGE_TAG} \
                      -t ${BACKEND_IMAGE}:latest \
                      .
                    echo "Built: ${BACKEND_IMAGE}:${IMAGE_TAG}"
                '''
            }
        }
        stage('Build Frontend Image') {
            steps {
                echo "=== Stage 5: Build Frontend Docker Image ==="
                sh '''
                    cd frontend
                    docker build \
                      -t ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                      -t ${FRONTEND_IMAGE}:latest \
                      .
                    echo "Built: ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                '''
            }
        }
        stage('Trivy Image Scan') {
            steps {
                echo "=== Stage 6: Trivy Container Scan ==="
                catchError(
                    buildResult: 'SUCCESS',
                    stageResult: 'UNSTABLE'
                ) {
                    sh '''
                        mkdir -p reports/trivy

                        echo "Scanning backend..."
                        trivy image \
                          --exit-code 0 \
                          --severity HIGH,CRITICAL \
                          --format table \
                          --output reports/trivy/backend-scan.txt \
                          ${BACKEND_IMAGE}:${IMAGE_TAG}

                        echo "Scanning frontend..."
                        trivy image \
                          --exit-code 0 \
                          --severity HIGH,CRITICAL \
                          --format table \
                          --output reports/trivy/frontend-scan.txt \
                          ${FRONTEND_IMAGE}:${IMAGE_TAG}

                        echo "=== Backend Results ==="
                        cat reports/trivy/backend-scan.txt
                        echo "=== Frontend Results ==="
                        cat reports/trivy/frontend-scan.txt
                    '''
                }
            }
        }
        stage('Push to Docker Hub') {
            steps {
                echo "=== Stage 7: Push to Docker Hub ==="
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo ${DOCKER_PASS} | \
                          docker login -u ${DOCKER_USER} \
                          --password-stdin
                        docker push ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push ${BACKEND_IMAGE}:latest
                        docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push ${FRONTEND_IMAGE}:latest
                        docker logout
                        echo "Pushed: ${IMAGE_TAG}"
                    '''
                }
            }
        }
        stage('Update K8s Manifests') {
            steps {
                echo "=== Stage 8: Update K8s Manifests ==="
                withCredentials([usernamePassword(
                    credentialsId: 'github-creds',
                    usernameVariable: 'GIT_USER',
                    passwordVariable: 'GIT_TOKEN'
                )]) {
                    sh '''
                        rm -rf k8s-repo
                        git clone \
                          https://${GIT_USER}:${GIT_TOKEN}@github.com/smitgedam/devsecops-k8s.git \
                          k8s-repo

                        cd k8s-repo

                        sed -i \
                          "s|image: smitgedam/devsecops-backend:.*|image: smitgedam/devsecops-backend:${IMAGE_TAG}|g" \
                          manifests/backend.yaml

                        sed -i \
                          "s|image: smitgedam/devsecops-frontend:.*|image: smitgedam/devsecops-frontend:${IMAGE_TAG}|g" \
                          manifests/frontend.yaml

                        git config user.email "jenkins@devsecops.local"
                        git config user.name "Jenkins CI"

                        git add manifests/backend.yaml manifests/frontend.yaml

                        git diff --staged --quiet && \
                          echo "No manifest changes — same tag, skipping commit" || \
                          git commit -m "ci: update images to ${IMAGE_TAG} [skip ci]" && \
                          git push origin main || true

                        echo "Manifests stage done: ${IMAGE_TAG}"
                    '''
                }
            }
        }
        stage('Cleanup') {
            steps {
                echo "=== Stage 9: Cleanup ==="
                sh '''
                    docker rmi \
                      ${BACKEND_IMAGE}:${IMAGE_TAG} \
                      ${FRONTEND_IMAGE}:${IMAGE_TAG} \
                      2>/dev/null || true
                    docker logout 2>/dev/null || true
                    rm -rf k8s-repo
                    rm -rf backend/node_modules frontend/node_modules
                    echo "Cleanup done"
                '''
            }
        }
    }
    post {
        success {
            echo "✓ Pipeline SUCCESS — ${IMAGE_TAG}"
        }
        unstable {
            echo "⚠ Pipeline UNSTABLE — security warnings present"
        }
        failure {
            echo "✗ Pipeline FAILED — check logs"
        }
        always {
            cleanWs()
        }
    }
}
