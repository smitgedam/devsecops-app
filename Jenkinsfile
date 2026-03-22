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
            }
        }

        stage('SonarQube Analysis') {
            steps {
                echo "=== Stage 2: SonarQube SAST ==="
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
                              --failOnCVSS 9
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
                        trivy image \
                          --exit-code 0 \
                          --severity HIGH,CRITICAL \
                          --format table \
                          --output \
                          reports/trivy/backend-scan.txt \
                          ${BACKEND_IMAGE}:${IMAGE_TAG}

                        trivy image \
                          --exit-code 0 \
                          --severity HIGH,CRITICAL \
                          --format table \
                          --output \
                          reports/trivy/frontend-scan.txt \
                          ${FRONTEND_IMAGE}:${IMAGE_TAG}

                        echo "=== Backend Trivy Results ==="
                        cat reports/trivy/backend-scan.txt
                        echo "=== Frontend Trivy Results ==="
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
                        docker push \
                          ${BACKEND_IMAGE}:${IMAGE_TAG}
                        docker push \
                          ${BACKEND_IMAGE}:latest
                        docker push \
                          ${FRONTEND_IMAGE}:${IMAGE_TAG}
                        docker push \
                          ${FRONTEND_IMAGE}:latest
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
                        git config user.email \
                          "jenkins@devsecops.local"
                        git config user.name "Jenkins CI"
                        git add \
                          manifests/backend.yaml \
                          manifests/frontend.yaml
                        git diff --staged --quiet || \
                          git commit -m \
                          "ci: update images to ${IMAGE_TAG} [skip ci]"
                        git push origin main
                        echo "Manifests updated: ${IMAGE_TAG}"
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
                    rm -rf k8s-repo
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
            echo "⚠ Pipeline UNSTABLE — security warnings"
        }
        failure {
            echo "✗ Pipeline FAILED — check logs"
        }
        always {
            cleanWs()
        }
    }
}
