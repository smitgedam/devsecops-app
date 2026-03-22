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
                sh 'echo "Branch: $(git branch --show-current)"'
                sh 'echo "Commit: $(git rev-parse --short HEAD)"'
                sh 'ls -la'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                echo "=== Stage 2: SonarQube SAST ==="
                script {
                    if (fileExists('/opt/sonar-scanner/bin/sonar-scanner')) {
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
                                  -Dsonar.login=${SONAR_TOKEN}
                            '''
                        }
                    } else {
                        echo "SonarQube scanner not installed — skipping"
                        echo "Install path: /opt/sonar-scanner"
                    }
                }
            }
        }

        stage('OWASP Dependency Check') {
            steps {
                echo "=== Stage 3: OWASP Dependency Scan ==="
                script {
                    if (fileExists('/opt/dependency-check/bin/dependency-check.sh')) {
                        sh '''
                            mkdir -p reports/dependency-check
                            /opt/dependency-check/bin/dependency-check.sh \
                              --project "devsecops-app" \
                              --scan ./backend \
                              --scan ./frontend \
                              --format HTML \
                              --format JSON \
                              --out ./reports/dependency-check \
                              --failOnCVSS 9 \
                              --enableRetired
                        '''
                        publishHTML([
                            allowMissing: true,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: 'reports/dependency-check',
                            reportFiles: 'dependency-check-report.html',
                            reportName: 'OWASP Report'
                        ])
                    } else {
                        echo "OWASP Dependency Check not installed — skipping"
                        echo "Install path: /opt/dependency-check"
                    }
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
                    echo "Backend image built: ${BACKEND_IMAGE}:${IMAGE_TAG}"
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
                    echo "Frontend image built: ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                '''
            }
        }

        stage('Trivy Image Scan') {
            steps {
                echo "=== Stage 6: Trivy Container Scan ==="
                script {
                    if (sh(script: 'which trivy', returnStatus: true) == 0) {
                        sh '''
                            mkdir -p reports/trivy
                            trivy image \
                              --exit-code 0 \
                              --severity HIGH,CRITICAL \
                              --format table \
                              --output reports/trivy/backend-scan.txt \
                              ${BACKEND_IMAGE}:${IMAGE_TAG}
                            trivy image \
                              --exit-code 0 \
                              --severity HIGH,CRITICAL \
                              --format table \
                              --output reports/trivy/frontend-scan.txt \
                              ${FRONTEND_IMAGE}:${IMAGE_TAG}
                            echo "=== Backend Trivy Results ==="
                            cat reports/trivy/backend-scan.txt
                            echo "=== Frontend Trivy Results ==="
                            cat reports/trivy/frontend-scan.txt
                        '''
                    } else {
                        echo "Trivy not installed — skipping"
                        echo "Install: sudo apt install trivy"
                    }
                }
            }
        }

        stage('Push to Docker Hub') {
            steps {
                echo "=== Stage 7: Push Images to Docker Hub ==="
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
                        echo "Images pushed successfully"
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
                        sed -i "s|image: smitgedam/devsecops-backend:.*|image: smitgedam/devsecops-backend:${IMAGE_TAG}|g" \
                          manifests/backend.yaml
                        sed -i "s|image: smitgedam/devsecops-frontend:.*|image: smitgedam/devsecops-frontend:${IMAGE_TAG}|g" \
                          manifests/frontend.yaml
                        git config user.email "jenkins@devsecops.local"
                        git config user.name "Jenkins CI"
                        git add manifests/backend.yaml \
                                manifests/frontend.yaml
                        git diff --staged --quiet || \
                          git commit -m \
                          "ci: update images to ${IMAGE_TAG} [skip ci]"
                        git push origin main
                        echo "Manifests updated to ${IMAGE_TAG}"
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
                    echo "Cleanup complete"
                '''
            }
        }
    }

    post {
        success {
            echo "✓ Pipeline SUCCESS — Build ${IMAGE_TAG} complete"
        }
        failure {
            echo "✗ Pipeline FAILED — Check stage logs above"
        }
        always {
            cleanWs()
        }
    }
}
