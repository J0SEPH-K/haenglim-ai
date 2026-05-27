"""Seed mock conversation data for admin@admin.com"""
from datetime import datetime, timezone, timedelta
from app.database import engine, Base, SessionLocal
from app.models.models import User, AIProvider, Conversation, Message
from app.utils.encryption import encrypt_api_key

db = SessionLocal()

# Get admin user
admin = db.query(User).filter(User.email == "admin@admin.com").first()
if not admin:
    print("Admin user not found. Run init_db.py first.")
    db.close()
    exit(1)

# Create a mock AI provider if none exists
provider = db.query(AIProvider).first()
if not provider:
    provider = AIProvider(
        name="GPT-4o (Mock)",
        provider_type="openai",
        api_key_encrypted=encrypt_api_key("mock-api-key"),
        model_id="gpt-4o",
        enabled=True,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    print(f"Created mock provider: {provider.name}")

# Create mock conversation
base_time = datetime.now(timezone.utc) - timedelta(hours=1)

conv = Conversation(
    title="서울 여행 계획 도움",
    mode="chat",
    user_id=admin.id,
    ai_provider_id=provider.id,
    created_at=base_time,
    updated_at=base_time + timedelta(minutes=30),
)
db.add(conv)
db.commit()
db.refresh(conv)

# Mock messages (5 user + 5 assistant, including image)
messages_data = [
    {
        "role": "user",
        "text": "이번 주말에 서울 여행을 계획하고 있어요. 추천할 만한 장소가 있을까요?",
        "message_type": "text",
        "offset_min": 0,
    },
    {
        "role": "assistant",
        "text": "서울 주말 여행이라니 좋은 계획이네요! 몇 가지 추천드릴게요:\n\n1. **경복궁** - 한복 체험과 함께 조선시대 궁궐을 둘러볼 수 있어요\n2. **북촌 한옥마을** - 전통 한옥이 밀집한 아름다운 골목길\n3. **남산타워** - 서울 시내 전경을 한눈에 볼 수 있는 전망대\n4. **익선동** - 트렌디한 카페와 레스토랑이 모여 있는 핫플레이스\n5. **한강공원** - 치맥(치킨+맥주)과 함께 여유로운 시간을 보내기 좋아요\n\n어떤 분위기를 선호하시나요? 더 구체적으로 추천해드릴 수 있어요!",
        "message_type": "text",
        "offset_min": 1,
    },
    {
        "role": "user",
        "text": "경복궁 근처에서 맛있는 점심을 먹을 수 있는 곳을 알려주세요.",
        "message_type": "text",
        "offset_min": 3,
    },
    {
        "role": "assistant",
        "text": "경복궁 근처 맛집을 추천해드릴게요! 🍽️\n\n**한식**\n- **토속촌삼계탕** - 경복궁역 근처, 전통 삼계탕으로 유명\n- **풍년쌈밥** - 다양한 쌈 채소와 함께 즐기는 한정식\n\n**분위기 좋은 곳**\n- **서촌의 카페거리** - 경복궁 서쪽, 소규모 레스토랑과 카페가 많아요\n- **통인시장** - 도시락 카페에서 엽전으로 반찬을 골라 나만의 도시락을 만들 수 있어요\n\n**가성비**\n- **광화문 지하상가** - 다양한 음식점이 밀집해 있어 선택의 폭이 넓어요\n\n개인적으로 통인시장 도시락 카페를 강력 추천합니다! 독특한 경험이 될 거예요.",
        "message_type": "text",
        "offset_min": 4,
    },
    {
        "role": "user",
        "text": "서울의 야경이 예쁜 곳의 사진을 보여줄 수 있어?",
        "message_type": "text",
        "offset_min": 8,
    },
    {
        "role": "assistant",
        "text": "서울의 대표적인 야경 명소들을 소개해드릴게요!\n\n위 사진은 남산타워에서 바라본 서울 야경입니다. 이 외에도 추천 야경 포인트는:\n\n- **반포대교 달빛무지개분수** - 매일 저녁 분수쇼가 펼쳐져요\n- **DDP (동대문디자인플라자)** - 자하 하디드가 설계한 건축물의 야간 조명이 아름다워요\n- **노들섬** - 한강 위의 섬에서 보는 야경이 환상적이에요",
        "image_url": "https://images.unsplash.com/photo-1617469955236-7f13d4b4a1c0?w=800",
        "message_type": "text",
        "offset_min": 10,
    },
    {
        "role": "user",
        "text": "한강공원에서 할 수 있는 활동들을 알려줘",
        "message_type": "text",
        "offset_min": 15,
    },
    {
        "role": "assistant",
        "text": "한강공원에서 즐길 수 있는 활동들이 정말 많아요!\n\n**액티비티**\n- 🚲 자전거 대여 (따릉이) - 한강변을 따라 라이딩\n- 🛶 카약/수상레저 - 여의도, 잠실 등에서 이용 가능\n- ⛺ 텐트/피크닉 - 돗자리와 간식을 준비해서 여유롭게\n\n**먹거리**\n- 🍗 배달음식 주문 (치킨, 피자 등)\n- 🍜 편의점 컵라면 + 한강 뷰 = 최고의 조합\n- 🌽 매점에서 구운 옥수수, 라면\n\n**문화/여가**\n- 🎵 버스킹 공연 감상 (주로 반포, 여의도)\n- 🌅 일몰 감상 - 특히 마포대교 근처가 유명\n- 📖 독서 or 낮잠\n\n주말 저녁에는 사람이 많으니 오후 일찍 가시는 걸 추천해요!",
        "message_type": "text",
        "offset_min": 16,
    },
    {
        "role": "user",
        "text": "마지막으로 서울에서 꼭 사야 할 기념품이 있을까?",
        "message_type": "text",
        "offset_min": 22,
    },
    {
        "role": "assistant",
        "text": "서울 기념품 추천 리스트입니다! 🎁\n\n**전통 기념품**\n- 한국 전통 부채 - 경복궁 근처 기념품샵\n- 한복 소품 (머리띠, 노리개) - 인사동에서 구매 가능\n- 도자기/청자 찻잔 세트 - 인사동, 삼청동\n\n**K-뷰티**\n- 한국 화장품 (이니스프리, 미샤 등) - 명동이 가장 다양\n- 시트 마스크팩 세트 - 가볍고 선물하기 좋아요\n\n**먹거리 기념품**\n- 김 (광장시장에서 대량 구매 가능)\n- 고추장/된장 소포장\n- 한국 전통 과자 (약과, 강정)\n\n**트렌디한 선물**\n- 한글 디자인 굿즈 - 교보문고 핫트랙스\n- K-pop 관련 굿즈 - 각 소속사 팝업스토어\n\n인사동 거리가 기념품 쇼핑하기에 가장 좋은 장소예요! 다양한 가격대의 상품이 있어서 부담 없이 둘러볼 수 있습니다.",
        "message_type": "text",
        "offset_min": 24,
    },
]

for msg_data in messages_data:
    msg = Message(
        conversation_id=conv.id,
        role=msg_data["role"],
        text=msg_data["text"],
        image_url=msg_data.get("image_url"),
        message_type=msg_data["message_type"],
        created_at=base_time + timedelta(minutes=msg_data["offset_min"]),
    )
    db.add(msg)

db.commit()

conv_title = conv.title
msg_count = len(messages_data)

db.close()

print(f"Mock conversation created: '{conv_title}' with {msg_count} messages")
