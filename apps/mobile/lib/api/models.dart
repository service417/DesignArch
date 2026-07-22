/// Shapes the API returns.
///
/// Monetary amounts are typed `String?` throughout, mirroring the server's
/// BigInt serialisation. Typing them as String is what stops a careless
/// arithmetic expression compiling.
library;

class AppUser {
  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  final String id;
  final String name;
  final String email;
  final String role;

  bool get isSupervisor => role == 'SUPERVISOR';
  bool get isWorker => role == 'CARPENTER' || role == 'PAINTER';

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
        role: json['role'] as String,
      );
}

class ProjectRef {
  ProjectRef({required this.name, required this.client});
  final String name;
  final String client;

  factory ProjectRef.fromJson(Map<String, dynamic> json) => ProjectRef(
        name: json['name'] as String,
        client: json['client'] as String,
      );
}

class JobCardRef {
  JobCardRef({required this.id, required this.title, this.description, required this.project});
  final String id;
  final String title;
  final String? description;
  final ProjectRef project;

  factory JobCardRef.fromJson(Map<String, dynamic> json) => JobCardRef(
        id: json['id'] as String,
        title: json['title'] as String,
        description: json['description'] as String?,
        project: ProjectRef.fromJson(json['project'] as Map<String, dynamic>),
      );
}

class PersonRef {
  PersonRef({required this.id, required this.name});
  final String id;
  final String name;

  factory PersonRef.fromJson(Map<String, dynamic> json) => PersonRef(
        id: json['id'] as String,
        name: json['name'] as String,
      );
}

class Stage {
  Stage({
    required this.id,
    required this.type,
    required this.status,
    required this.version,
    required this.updatedAt,
    required this.jobCard,
    this.assignee,
    this.acceptedPrice,
    this.proposedPrice,
    this.rejectionReason,
    this.photoCount = 0,
  });

  final String id;
  final String type;
  final String status;
  final int version;
  final String updatedAt;
  final JobCardRef jobCard;
  final PersonRef? assignee;
  final String? acceptedPrice;
  final String? proposedPrice;
  final String? rejectionReason;
  final int photoCount;

  bool get isCarpentry => type == 'CARPENTRY';

  factory Stage.fromJson(Map<String, dynamic> json) => Stage(
        id: json['id'] as String,
        type: json['type'] as String,
        status: json['status'] as String,
        version: json['version'] as int,
        updatedAt: json['updatedAt'] as String,
        jobCard: JobCardRef.fromJson(json['jobCard'] as Map<String, dynamic>),
        assignee: json['assignee'] == null
            ? null
            : PersonRef.fromJson(json['assignee'] as Map<String, dynamic>),
        acceptedPrice: json['acceptedPrice'] as String?,
        proposedPrice: json['proposedPrice'] as String?,
        rejectionReason: json['rejectionReason'] as String?,
        photoCount: (json['_count'] as Map<String, dynamic>?)?['photos'] as int? ?? 0,
      );
}

class InspectionPhoto {
  InspectionPhoto({required this.id, required this.url, required this.createdAt, this.supervisor});
  final String id;
  final String url;
  final String createdAt;
  final PersonRef? supervisor;

  factory InspectionPhoto.fromJson(Map<String, dynamic> json) => InspectionPhoto(
        id: json['id'] as String,
        url: json['url'] as String,
        createdAt: json['createdAt'] as String,
        supervisor: json['supervisor'] == null
            ? null
            : PersonRef.fromJson(json['supervisor'] as Map<String, dynamic>),
      );
}

class PricingEvent {
  PricingEvent({
    required this.id,
    required this.action,
    required this.createdAt,
    this.value,
    this.reason,
    this.actorName,
  });

  final String id;
  final String action;
  final String createdAt;
  final String? value;
  final String? reason;
  final String? actorName;

  factory PricingEvent.fromJson(Map<String, dynamic> json) => PricingEvent(
        id: json['id'] as String,
        action: json['action'] as String,
        createdAt: json['createdAt'] as String,
        value: json['value'] as String?,
        reason: json['reason'] as String?,
        actorName: (json['actor'] as Map<String, dynamic>?)?['name'] as String?,
      );
}

class StageDetail {
  StageDetail({
    required this.stage,
    required this.photos,
    required this.pricingHistory,
    this.earningStatus,
    this.earningAmount,
  });

  final Stage stage;
  final List<InspectionPhoto> photos;
  final List<PricingEvent> pricingHistory;
  final String? earningStatus;
  final String? earningAmount;

  factory StageDetail.fromJson(Map<String, dynamic> json) {
    final earning = json['earning'] as Map<String, dynamic>?;
    return StageDetail(
      stage: Stage.fromJson(json),
      photos: (json['photos'] as List<dynamic>? ?? [])
          .map((p) => InspectionPhoto.fromJson(p as Map<String, dynamic>))
          .toList(),
      pricingHistory: (json['pricingHistory'] as List<dynamic>? ?? [])
          .map((p) => PricingEvent.fromJson(p as Map<String, dynamic>))
          .toList(),
      earningStatus: earning?['status'] as String?,
      earningAmount: earning?['amount'] as String?,
    );
  }
}

class Earning {
  Earning({
    required this.id,
    required this.amount,
    required this.status,
    required this.createdAt,
    required this.jobCardTitle,
    required this.projectName,
    this.paidAt,
  });

  final String id;
  final String amount;
  final String status;
  final String createdAt;
  final String jobCardTitle;
  final String projectName;
  final String? paidAt;

  bool get isPaid => status == 'PAID';

  factory Earning.fromJson(Map<String, dynamic> json) {
    final stage = json['stage'] as Map<String, dynamic>;
    final card = stage['jobCard'] as Map<String, dynamic>;
    final project = card['project'] as Map<String, dynamic>;
    return Earning(
      id: json['id'] as String,
      amount: json['amount'] as String,
      status: json['status'] as String,
      createdAt: json['createdAt'] as String,
      paidAt: json['paidAt'] as String?,
      jobCardTitle: card['title'] as String,
      projectName: project['name'] as String,
    );
  }
}

class EarningsSummary {
  EarningsSummary({required this.earnings, required this.unpaidTotal, required this.paidTotal});
  final List<Earning> earnings;
  final String unpaidTotal;
  final String paidTotal;

  factory EarningsSummary.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>;
    return EarningsSummary(
      earnings: (json['earnings'] as List<dynamic>)
          .map((e) => Earning.fromJson(e as Map<String, dynamic>))
          .toList(),
      unpaidTotal: summary['unpaidTotal'] as String,
      paidTotal: summary['paidTotal'] as String,
    );
  }
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.eventType,
    required this.refType,
    required this.refId,
    required this.readFlag,
    required this.createdAt,
  });

  final String id;
  final String eventType;
  final String refType;
  final String refId;
  final bool readFlag;
  final String createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        eventType: json['eventType'] as String,
        refType: json['refType'] as String,
        refId: json['refId'] as String,
        readFlag: json['readFlag'] as bool,
        createdAt: json['createdAt'] as String,
      );
}
