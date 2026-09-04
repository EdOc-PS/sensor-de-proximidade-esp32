const int pinoPIR = 2;  // D2

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  pinMode(pinoPIR, INPUT);
  
  Serial.println("Teste do sensor PIR iniciado!");
  Serial.println("Aguardando o sensor estabilizar (30 segundos)...");
  delay(30000); // PIR precisa de um tempo pra calibrar quando liga
  Serial.println("Pronto! Pode testar o movimento.");
}

void loop() {
  int leituraPIR = digitalRead(pinoPIR);
  
  if (leituraPIR == HIGH) {
    Serial.println("Movimento detectado!");
  } else {
    Serial.println("Sem movimento...");
  }
  
  delay(500); // Atualiza a cada meio segundo
}