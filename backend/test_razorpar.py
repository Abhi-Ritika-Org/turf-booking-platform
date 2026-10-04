import razorpay

client = razorpay.Client(
    auth=("rzp_test_Ssihc5WpWuil3A", "jlAtH6oZosPUk4yZ4ec24BKC")
)

print(
    client.order.create({
        "amount": 50000,
        "currency": "INR",
        "receipt": "test_receipt"
    })
)